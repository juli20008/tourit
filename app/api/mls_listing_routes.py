from flask import Blueprint, jsonify, request
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
_CACHE_TTL = 60  # seconds

def _cache_get(key):
    entry = _cache.get(key)
    if entry and time.time() - entry['ts'] < _CACHE_TTL:
        return entry['data']
    return None

def _cache_set(key, data):
    _cache[key] = {'data': data, 'ts': time.time()}
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
            return _fetch_local_properties(page, per_page, lightweight=lightweight)

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
    except OperationalError:
        return _fetch_local_properties(page, per_page, lightweight=lightweight)


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

    try:
        t_type_filter = "AND transaction_type = :t_type" if t_type else ""
        sql = text(f"""
            SELECT id, mls_number, lat, lng, list_price, bed, bath, sqft,
                   street_number, street_name, street_suffix, unit_number,
                   city, state, zip, standard_status, status, transaction_type,
                   brokerage, property_class, external_id, photos_timestamp,
                   images->>0 AS front_img, ownership_type
            FROM mls_listings
            WHERE lat BETWEEN :lat_min AND :lat_max
              AND lng BETWEEN :lng_min AND :lng_max
              AND lat IS NOT NULL AND lng IS NOT NULL AND list_price IS NOT NULL
              AND (standard_status IS NULL OR standard_status NOT IN
                   ('Inactive','Sold','Expired','Cancelled','Withdrawn'))
              AND (property_type IS NULL OR property_type NOT IN ('303','304','305'))
              {t_type_filter}
            ORDER BY updated_at DESC NULLSLAST, list_price DESC NULLSLAST
            LIMIT :limit
        """)
        params = dict(lat_min=lat_min, lat_max=lat_max, lng_min=lng_min, lng_max=lng_max, limit=limit)
        if t_type:
            params['t_type'] = t_type
        rows = db.session.execute(sql, params).mappings().all()
        if not rows:
            return _fetch_local_bounds(lat_min, lat_max, lng_min, lng_max, limit, lightweight=True)

        listings_out = []
        for r in rows:
            cat = _determine_category(r['property_class'], r['unit_number'])
            street = ' '.join(filter(None, [r['street_number'], r['street_name'], r['street_suffix']]))
            front = r['front_img']
            if not front and r['external_id'] and r['photos_timestamp']:
                front = _build_cdn_image_url(r['external_id'], r['photos_timestamp'], 1)
            sqft_val = r['sqft']
            if sqft_val and '-' not in str(sqft_val):
                try: sqft_val = int(sqft_val)
                except (ValueError, TypeError): pass
            listings_out.append({
                'id':               f"mls_{r['id']}",
                'is_mls':           True,
                'mls_number':       r['mls_number'],
                'lat':              float(r['lat']) if r['lat'] is not None else None,
                'lng':              float(r['lng']) if r['lng'] is not None else None,
                'price':            r['list_price'] or 0,
                'bed':              r['bed'] or 0,
                'bath':             float(r['bath']) if r['bath'] is not None else 0,
                'sqft':             sqft_val,
                'street':           street,
                'unit':             r['unit_number'] or '',
                'city':             r['city'] or '',
                'state':            r['state'] or '',
                'zip':              r['zip'] or '',
                'status':           r['standard_status'] or r['status'] or 'Active',
                'category':         cat,
                'type':             cat,
                'transaction_type': r['transaction_type'] or 'For Sale',
                'brokerage':        r['brokerage'] or '',
                'office':           r['brokerage'] or '',
                'front_img':        front,
                'image_url':        front,
                'ownership_type':   r['ownership_type'],
            })

        return jsonify({"listings": listings_out, "total": len(listings_out), "page": 1, "per_page": limit})
    except OperationalError:
        return _fetch_local_bounds(lat_min, lat_max, lng_min, lng_max, limit, lightweight=True)


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
            )
            .order_by(MlsListing.updated_at.desc().nullslast())
            .limit(20000)
            .all()
        )

        index = []
        for r in rows:
            street = ' '.join(filter(None, [r.street_number, r.street_name, r.street_suffix]))
            cat    = _determine_category(r.property_class, r.unit_number)

            front = None
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

        resp = jsonify({"index": index})
        resp.headers["Cache-Control"] = "public, max-age=3600"
        return resp
    except OperationalError:
        return jsonify({"index": []})


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
