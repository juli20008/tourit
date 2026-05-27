from flask import Blueprint, jsonify, request, Response
import json
import os
import sqlite3
import time
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from ..models.mls_listing import MlsListing, _determine_category, _build_cdn_image_url
from ..models.db import db
from ..rate_limit import rate_limit_check

mls_listing_routes = Blueprint("mls_listings", __name__)
mls_listing_routes.before_request(rate_limit_check)

MAX_RESULTS = 100
MAX_MAP_RESULTS = 500

# Simple in-memory cache for expensive map queries
_cache: dict = {}
_CACHE_TTL = 300  # seconds

def _cache_get(key):
    entry = _cache.get(key)
    if entry and time.time() - entry['ts'] < _CACHE_TTL:
        return entry['data']
    return None

def _cache_set(key, data):
    _cache[key] = {'data': data, 'ts': time.time()}

# Pin-index cache stores the serialized JSON string (not Python dicts) so only
# ~2 MB stays in memory instead of ~20 MB worth of Python dict objects.
_pin_index_cache: dict = {'json': None, 'ts': 0.0}
_PIN_INDEX_TTL = 1800  # 30 minutes — cold query is expensive; keep cached as long as safe
USE_LOCAL_PROPERTIES = os.environ.get("FORCE_LOCAL_DB", "").strip() == "1"
LOCAL_DB_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "instance", "yillow.db")
)


def _sqlite_rows(sql, params=()):
    if not os.path.exists(LOCAL_DB_PATH):
        return []
    conn = sqlite3.connect(LOCAL_DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        cur = conn.execute(sql, params)
        return [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()


def _sqlite_count(table_name):
    rows = _sqlite_rows(f"SELECT COUNT(*) AS c FROM {table_name}")
    return rows[0]["c"] if rows else 0


def _sqlite_property_images(property_id):
    return _sqlite_rows(
        "SELECT id, img_url FROM property_imgs WHERE property_id = ? ORDER BY id ASC",
        (property_id,),
    )


def _serialize_local_property(row, lightweight=False):
    images = _sqlite_property_images(row["id"])
    data = {
        "id": f"mls_{row['id']}",
        "is_mls": True,
        "mls_number": row["listing_id"],
        "status": row["status"],
        "type": row["type"],
        "style": row["type"] or "",
        "property_type": row["type"] or "",
        "transaction_type": "",
        "property_class": "",
        "price": row["price"],
        "sold_price": None,
        "original_price": None,
        "bed": row["bed"],
        "bath": float(row["bath"]) if row["bath"] is not None else 0,
        "sqft": row["sqft"],
        "lot": row["lot"],
        "built": row["built"],
        "garage": row["garage"],
        "street": row["street"],
        "unit": "",
        "city": row["city"] or "",
        "state": row["state"] or "",
        "zip": row["zip"] or "",
        "neighborhood": "",
        "listing_id": row["listing_id"],
        "listing_date": row["listing_date"],
        "updated_at": None,
        "description": row["description"],
        "listing_agent_id": row["listing_agent_id"],
        "office": "",
        "brokerage": "",
        "agent_name": "",
        "agent_email": "",
        "front_img": row["front_img"],
        "images": [img["id"] for img in images],
        "image_urls": [img["img_url"] for img in images],
        "lat": row["lat"],
        "lng": row["long"],
    }
    if lightweight:
        data.pop("description", None)
        data.pop("images", None)
        data.pop("image_urls", None)
    return data


def _fetch_local_properties(page, per_page, lightweight=False):
    offset = (page - 1) * per_page
    rows = _sqlite_rows(
        """
        SELECT p.id, p.status, p.street, p.city, s.state AS state, p.zip, p.type,
               p.price, p.bed, p.bath, p.sqft, p.lot, p.built, p.listing_id,
               p.listing_date, p.listing_agent_id, p.lat, p.long, p.front_img,
               p.description, p.garage
        FROM properties p
        LEFT JOIN states s ON s.id = p.state_id
        ORDER BY p.listing_date DESC, p.price DESC
        LIMIT ? OFFSET ?
        """,
        (per_page, offset),
    )
    total = min(_sqlite_count("properties"), MAX_RESULTS)
    pages = (total + per_page - 1) // per_page if per_page > 0 else 0
    return jsonify(
        {
            "listings": [_serialize_local_property(row, lightweight=lightweight) for row in rows],
            "total": total,
            "pages": pages,
            "page": page,
            "per_page": per_page,
        }
    )


def _fetch_local_bounds(lat_min, lat_max, lng_min, lng_max, limit, lightweight=False):
    rows = _sqlite_rows(
        """
        SELECT p.id, p.status, p.street, p.city, s.state AS state, p.zip, p.type,
               p.price, p.bed, p.bath, p.sqft, p.lot, p.built, p.listing_id,
               p.listing_date, p.listing_agent_id, p.lat, p.long, p.front_img,
               p.description, p.garage
        FROM properties p
        LEFT JOIN states s ON s.id = p.state_id
        WHERE p.lat BETWEEN ? AND ? AND p.long BETWEEN ? AND ?
        ORDER BY p.listing_date DESC, p.price DESC
        LIMIT ?
        """,
        (lat_min, lat_max, lng_min, lng_max, limit),
    )
    return jsonify(
        {
            "listings": [_serialize_local_property(row, lightweight=lightweight) for row in rows],
            "total": len(rows),
            "page": 1,
            "per_page": limit,
        }
    )


def _serialize_listing(listing: MlsListing, lightweight: bool = False):
    if lightweight:
        return listing.to_map_pin_dict()
    return listing.to_frontend_dict()


@mls_listing_routes.route("/", methods=["GET"])
def list_listings():
    page = request.args.get("page", 1, type=int)
    per_page = min(request.args.get("per_page", 20, type=int), MAX_RESULTS)
    view = request.args.get("view", "").strip().lower()
    lightweight = view == "map"
    if lightweight:
        per_page = min(request.args.get("per_page", MAX_MAP_RESULTS, type=int), MAX_MAP_RESULTS)

    if USE_LOCAL_PROPERTIES:
        return _fetch_local_properties(page, per_page, lightweight=lightweight)

    city = request.args.get("city", "").strip()
    status = request.args.get("status", "").strip()
    min_price = request.args.get("min_price", type=int)
    max_price = request.args.get("max_price", type=int)
    min_bed = request.args.get("min_bed", type=int)
    t_type = request.args.get("type", "").strip().lower()

    # Map view: use map_pin_filter (no JSONB scan) + cache result
    if lightweight and not any([city, status, min_price, max_price, min_bed, t_type]):
        cache_key = f"map_default_{page}_{per_page}"
        cached = _cache_get(cache_key)
        if cached:
            return jsonify(cached)

    try:
        base_filter = MlsListing.map_pin_filter() if lightweight else MlsListing.visible_filter()
        q = MlsListing.query.filter(base_filter)
        if city:
            q = q.filter(MlsListing.city.ilike(f"%{city}%"))
        if status:
            q = q.filter(MlsListing.standard_status.ilike(f"%{status}%"))
        if min_price:
            q = q.filter(MlsListing.list_price >= min_price)
        if max_price:
            q = q.filter(MlsListing.list_price <= max_price)
        if min_bed:
            q = q.filter(MlsListing.bed >= min_bed)
        if t_type:
            q = q.filter(MlsListing.transaction_type.ilike(f"%{t_type}%"))
        q = q.filter(MlsListing.property_type_filter())

        q = q.order_by(MlsListing.updated_at.desc().nullslast(), MlsListing.list_price.desc().nullslast())
        offset = (page - 1) * per_page

        if not lightweight and offset >= MAX_RESULTS:
            return jsonify(
                {
                    "listings": [],
                    "total": MAX_RESULTS,
                    "pages": MAX_RESULTS // per_page,
                    "page": page,
                    "per_page": per_page,
                }
            )

        if not lightweight:
            per_page = min(per_page, MAX_RESULTS - offset)

        items = q.offset(offset).limit(per_page).all()
        if not items:
            return jsonify({"listings": [], "total": 0, "pages": 1, "page": page, "per_page": per_page})

        cap = MAX_MAP_RESULTS if lightweight else MAX_RESULTS
        total = cap
        pages = (total + per_page - 1) // per_page if per_page > 0 else 0

        payload = {
            "listings": [_serialize_listing(l, lightweight=lightweight) for l in items],
            "total": total,
            "pages": pages,
            "page": page,
            "per_page": per_page,
        }

        if lightweight and not any([city, status, min_price, max_price, min_bed, t_type]):
            _cache_set(f"map_default_{page}_{per_page}", payload)

        return jsonify(payload)
    except (OperationalError, Exception):
        return jsonify({"listings": [], "total": 0, "pages": 1, "page": page, "per_page": per_page})


@mls_listing_routes.route("/", methods=["POST"])
def list_listings_by_bounds():
    payload = request.get_json(silent=True) or {}
    view = (request.args.get("view") or payload.get("view") or "").strip().lower()
    lightweight = view == "map"

    try:
        if all(key in payload for key in ("lat_min", "lat_max", "lng_min", "lng_max")):
            lat_min = float(payload["lat_min"])
            lat_max = float(payload["lat_max"])
            lng_min = float(payload["lng_min"])
            lng_max = float(payload["lng_max"])
        elif all(key in payload for key in ("neLat", "swLat", "neLng", "swLng")):
            lat_min = float(payload["swLat"])
            lat_max = float(payload["neLat"])
            lng_min = float(payload["swLng"])
            lng_max = float(payload["neLng"])
        else:
            return jsonify({"error": "lat_min, lat_max, lng_min, lng_max required"}), 400
    except (KeyError, TypeError, ValueError):
        return jsonify({"error": "lat_min, lat_max, lng_min, lng_max required"}), 400

    try:
        limit = min(int(payload.get("limit", MAX_MAP_RESULTS) or MAX_MAP_RESULTS), MAX_MAP_RESULTS)
    except (TypeError, ValueError):
        limit = MAX_MAP_RESULTS

    if USE_LOCAL_PROPERTIES:
        return _fetch_local_bounds(lat_min, lat_max, lng_min, lng_max, limit, lightweight=lightweight or limit > MAX_RESULTS)

    t_type = (payload.get("transaction_type") or "").strip()

    # Cache bounds queries — round to ~1 km precision so nearby pans reuse results
    def _r(x): return round(x, 2)
    bounds_key = f"bounds_{_r(lat_min)}_{_r(lat_max)}_{_r(lng_min)}_{_r(lng_max)}_{t_type}"
    cached = _cache_get(bounds_key)
    if cached:
        return jsonify(cached)

    try:
        # Hard timeout: abort before Supabase times us out on a full table scan.
        # 25 s is generous enough for cold-start connections; indexes will make this <1 s.
        db.session.execute(text("SET LOCAL statement_timeout = '25000'"))

        q = MlsListing.query.filter(
            MlsListing.lat.between(lat_min, lat_max),
            MlsListing.lng.between(lng_min, lng_max),
            MlsListing.map_pin_filter(),
        )
        # Mirror client-side logic: "For Lease" means lease, everything else means
        # not-lease. DDF stores varied sale values ("Resale", "New", etc.) so an
        # exact match on "For Sale" would silently drop most listings.
        if t_type:
            if 'lease' in t_type.lower():
                q = q.filter(MlsListing.transaction_type.ilike('%lease%'))
            else:
                q = q.filter(~MlsListing.transaction_type.ilike('%lease%') | MlsListing.transaction_type.is_(None))
        q = q.filter(MlsListing.property_type_filter())
        # No ORDER BY — map pins have no meaningful sort order and sorting
        # all matching rows before LIMIT is the single most expensive step.
        q = q.limit(limit)
        listings = q.all()
        if not listings:
            return _fetch_local_bounds(lat_min, lat_max, lng_min, lng_max, limit, lightweight=lightweight or limit > MAX_RESULTS)

        lw = lightweight or limit > MAX_RESULTS
        serialized = []
        for l in listings:
            try:
                serialized.append(_serialize_listing(l, lightweight=lw))
            except Exception:
                pass  # skip corrupt listings rather than failing the whole response

        result = {
            "listings": serialized,
            "total": len(serialized),
            "page": 1,
            "per_page": limit,
        }
        _cache_set(bounds_key, result)
        return jsonify(result)
    except (OperationalError, Exception):
        # SQLite fallback has no GTA data — serve last good cache if available,
        # otherwise empty so the client can retry rather than showing 0 listings.
        cached = _cache_get(bounds_key)
        if cached:
            return jsonify(cached)
        return jsonify({"listings": [], "total": 0, "page": 1, "per_page": limit})


@mls_listing_routes.route("/suggest", methods=["GET"])
def suggest_listings():
    """Real-time street-name autocomplete — fallback when client index has no match."""
    q = (request.args.get("q") or "").strip()
    # Extract the longest non-numeric token as the street-name fragment
    parts = [t for t in q.lower().split() if not t.isdigit() and len(t) >= 3]
    if not parts:
        return jsonify({"index": []})
    street_token = max(parts, key=len)

    try:
        rows = (
            db.session.query(
                MlsListing.id,
                MlsListing.mls_number,
                MlsListing.street_number,
                MlsListing.street_name,
                MlsListing.street_suffix,
                MlsListing.unit_number,
                MlsListing.city,
                MlsListing.list_price,
                MlsListing.bed,
                MlsListing.bath,
                MlsListing.property_class,
                MlsListing.external_id,
                MlsListing.photos_timestamp,
                MlsListing.images,
                MlsListing.lat,
                MlsListing.lng,
                MlsListing.transaction_type,
            )
            .filter(
                MlsListing.visible_filter(),
                MlsListing.street_name.isnot(None),
                MlsListing.street_name.ilike(f"{street_token}%"),
            )
            .order_by(MlsListing.updated_at.desc().nullslast())
            .limit(10)
            .all()
        )

        index = []
        for r in rows:
            street = ' '.join(filter(None, [r.street_number, r.street_name, r.street_suffix]))
            cat    = _determine_category(r.property_class, r.unit_number)
            front  = None
            for img in (r.images or []):
                s = str(img)
                if img and not s.startswith('sample/') and 'unsplash.com' not in s:
                    front = img
                    break
            if not front:
                front = _build_cdn_image_url(r.external_id, r.photos_timestamp, 1)
            index.append({
                'id':               f'mls_{r.id}',
                'mls_number':       r.mls_number,
                'street':           street,
                'unit':             r.unit_number or '',
                'city':             r.city or '',
                'price':            r.list_price or 0,
                'bed':              r.bed or 0,
                'bath':             float(r.bath) if r.bath is not None else 0,
                'category':         cat,
                'front_img':        front,
                'lat':              float(r.lat) if r.lat is not None else None,
                'lng':              float(r.lng) if r.lng is not None else None,
                'transaction_type': r.transaction_type or 'For Sale',
            })

        return jsonify({"index": index})
    except OperationalError:
        return jsonify({"index": []})


@mls_listing_routes.route("/address-index", methods=["GET"])
def address_index():
    """Lightweight address index for client-side autocomplete.

    Uses a column-only query (not full ORM objects) to keep memory under
    control — loading 20k full MlsListing objects with JSONB images columns
    was exceeding the 512 MB Render limit.
    """
    try:
        # No images/JSONB column — that caused full-table-scan timeouts on 20k rows.
        db.session.execute(text("SET LOCAL statement_timeout = '20000'"))
        rows = (
            db.session.query(
                MlsListing.id,
                MlsListing.mls_number,
                MlsListing.street_number,
                MlsListing.street_name,
                MlsListing.street_suffix,
                MlsListing.unit_number,
                MlsListing.city,
                MlsListing.list_price,
                MlsListing.bed,
                MlsListing.bath,
                MlsListing.property_class,
                MlsListing.lat,
                MlsListing.lng,
                MlsListing.transaction_type,
            )
            .filter(
                MlsListing.visible_filter(),
                MlsListing.street_name.isnot(None),
            )
            .order_by(MlsListing.updated_at.desc().nullslast())
            .limit(20000)
            .all()
        )

        index = []
        for r in rows:
            street = ' '.join(filter(None, [r.street_number, r.street_name, r.street_suffix]))
            cat    = _determine_category(r.property_class, r.unit_number)
            index.append({
                'id':               f'mls_{r.id}',
                'mls_number':       r.mls_number,
                'street':           street,
                'unit':             r.unit_number or '',
                'city':             r.city or '',
                'price':            r.list_price or 0,
                'bed':              r.bed or 0,
                'bath':             float(r.bath) if r.bath is not None else 0,
                'category':         cat,
                'front_img':        None,
                'lat':              float(r.lat) if r.lat is not None else None,
                'lng':              float(r.lng) if r.lng is not None else None,
                'transaction_type': r.transaction_type or 'For Sale',
            })

        resp = jsonify({"index": index})
        resp.headers["Cache-Control"] = "public, max-age=3600"
        return resp
    except (OperationalError, Exception):
        return jsonify({"index": []})


@mls_listing_routes.route("/pin-index", methods=["GET"])
def pin_index():
    """All active listings with coordinates — minimal payload, cached.

    Cache stores the serialized JSON string (not Python dicts) so only
    ~2 MB stays resident instead of ~20 MB of Python dict objects.
    """
    now = time.time()
    if _pin_index_cache['json'] and now - _pin_index_cache['ts'] < _PIN_INDEX_TTL:
        return Response(
            _pin_index_cache['json'],
            content_type='application/json',
            headers={"Cache-Control": "public, max-age=600"},
        )

    try:
        # GTA + surrounding area bounding box — wide enough to cover all Ontario
        # listings we care about. Using lat/lng range lets PostgreSQL use the
        # ix_mls_listings_lat / ix_mls_listings_lng indexes instead of a full
        # table scan, which is what made the old query slow / time-out.
        GTA_LAT_MIN, GTA_LAT_MAX = 43.2, 44.5
        GTA_LNG_MIN, GTA_LNG_MAX = -80.5, -78.2

        db.session.execute(text("SET LOCAL statement_timeout = '25000'"))
        rows = (
            db.session.query(
                MlsListing.id,
                MlsListing.mls_number,
                MlsListing.lat,
                MlsListing.lng,
                MlsListing.list_price,
                MlsListing.property_class,
                MlsListing.unit_number,
                MlsListing.transaction_type,
                MlsListing.bed,
                MlsListing.bath,
                MlsListing.sqft,
                MlsListing.street_number,
                MlsListing.street_name,
                MlsListing.street_suffix,
                MlsListing.city,
                MlsListing.standard_status,
                MlsListing.brokerage,
                MlsListing.external_id,
                MlsListing.photos_timestamp,
            )
            .filter(
                MlsListing.lat.between(GTA_LAT_MIN, GTA_LAT_MAX),
                MlsListing.lng.between(GTA_LNG_MIN, GTA_LNG_MAX),
                MlsListing.map_pin_filter(),
            )
            .limit(8000)
            .all()
        )

        pins = []
        for r in rows:
            cat    = _determine_category(r.property_class, r.unit_number)
            street = ' '.join(p for p in [r.street_number, r.street_name, r.street_suffix] if p)
            front  = _build_cdn_image_url(r.external_id, r.photos_timestamp, 1)
            sqft   = None
            if r.sqft:
                s = str(r.sqft)
                sqft = s if '-' in s else (int(s) if s.isdigit() else None)

            pins.append({
                'id':               f'mls_{r.id}',
                'mls_number':       r.mls_number,
                'is_mls':           True,
                'lat':              float(r.lat),
                'lng':              float(r.lng),
                'price':            r.list_price or 0,
                'category':         cat,
                'type':             cat,
                'transaction_type': r.transaction_type or 'For Sale',
                'bed':              r.bed or 0,
                'bath':             float(r.bath) if r.bath else 0,
                'sqft':             sqft,
                'street':           street,
                'city':             r.city or '',
                'front_img':        front,
                'status':           r.standard_status or 'Active',
                'brokerage':        r.brokerage or '',
            })

        # Serialize to a compact JSON string, then discard the Python list.
        # Keeping the string (~2 MB) is 10× cheaper than keeping the dicts (~20 MB).
        json_str = json.dumps({"pins": pins})
        _pin_index_cache['json'] = json_str
        _pin_index_cache['ts']   = now

        return Response(
            json_str,
            content_type='application/json',
            headers={"Cache-Control": "public, max-age=600"},
        )
    except (OperationalError, Exception):
        return Response('{"pins":[]}', content_type='application/json')


@mls_listing_routes.route("/nearby", methods=["GET"])
def nearby_listings():
    try:
        lat_min = float(request.args["lat_min"])
        lat_max = float(request.args["lat_max"])
        lng_min = float(request.args["lng_min"])
        lng_max = float(request.args["lng_max"])
    except (KeyError, ValueError):
        return jsonify({"error": "lat_min, lat_max, lng_min, lng_max required"}), 400

    limit = min(request.args.get("limit", 50, type=int), MAX_RESULTS)

    try:
        listings = (
            MlsListing.query
            .filter(
                MlsListing.lat.between(lat_min, lat_max),
                MlsListing.lng.between(lng_min, lng_max),
                MlsListing.visible_filter(),
            )
            .order_by(MlsListing.list_price)
            .limit(limit)
            .all()
        )
        return jsonify({"listings": [l.to_dict() for l in listings]})
    except OperationalError:
        return _fetch_local_bounds(lat_min, lat_max, lng_min, lng_max, limit, lightweight=False)


@mls_listing_routes.route("/<string:mls_number>/schools", methods=["GET"])
def get_listing_schools(mls_number):
    """Return YRDSB school assignment for a York Region listing (cached in school_info column)."""
    try:
        listing = MlsListing.query.filter_by(mls_number=mls_number).first_or_404()
    except OperationalError:
        return jsonify({"schools": None}), 404

    if listing.school_info:
        return jsonify({"schools": listing.school_info})

    from app.services.school_lookup import lookup_yrdsb_schools
    schools = lookup_yrdsb_schools(
        listing.street_number,
        listing.street_name,
        listing.street_suffix,
        listing.city,
    )

    if schools:
        try:
            listing.school_info = schools
            db.session.commit()
        except Exception:
            db.session.rollback()

    return jsonify({"schools": schools})


@mls_listing_routes.route("/<string:mls_number>", methods=["GET"])
def get_listing(mls_number):
    if USE_LOCAL_PROPERTIES:
        try:
            pid = int(mls_number)
        except (TypeError, ValueError):
            return jsonify({"listing": None}), 404

        rows = _sqlite_rows(
            """
            SELECT p.id, p.status, p.street, p.city, s.state AS state, p.zip, p.type,
                   p.price, p.bed, p.bath, p.sqft, p.lot, p.built, p.listing_id,
                   p.listing_date, p.listing_agent_id, p.lat, p.long, p.front_img,
                   p.description, p.garage
            FROM properties p
            LEFT JOIN states s ON s.id = p.state_id
            WHERE p.id = ?
            LIMIT 1
            """,
            (pid,),
        )
        if not rows:
            return jsonify({"listing": None}), 404
        return jsonify({"listing": _serialize_local_property(rows[0], lightweight=False)})

    try:
        listing = MlsListing.query.filter_by(mls_number=mls_number).first_or_404()
        return jsonify({"listing": listing.to_frontend_dict()})
    except OperationalError:
        return jsonify({"listing": None}), 404
