from flask import Blueprint, jsonify, request
import os
import sqlite3
from sqlalchemy.exc import OperationalError

from ..models.mls_listing import MlsListing
from ..rate_limit import rate_limit_check

mls_listing_routes = Blueprint("mls_listings", __name__)
mls_listing_routes.before_request(rate_limit_check)

MAX_RESULTS = 100
MAX_MAP_RESULTS = 1000
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
    return listing.to_frontend_light_dict() if lightweight else listing.to_frontend_dict()


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
    t_type = request.args.get("type", "").strip()

    try:
        q = MlsListing.query.filter(MlsListing.has_photos_filter())
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

        total = min(q.count(), MAX_RESULTS)
        if lightweight:
            total = min(q.count(), MAX_MAP_RESULTS)
        pages = (total + per_page - 1) // per_page if per_page > 0 else 0

        return jsonify(
            {
                "listings": [_serialize_listing(l, lightweight=lightweight) for l in items],
                "total": total,
                "pages": pages,
                "page": page,
                "per_page": per_page,
            }
        )
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

    try:
        q = (
            MlsListing.query
            .filter(
                MlsListing.lat.between(lat_min, lat_max),
                MlsListing.lng.between(lng_min, lng_max),
                MlsListing.list_price.isnot(None),
                MlsListing.has_photos_filter(),
            )
            .order_by(MlsListing.updated_at.desc().nullslast(), MlsListing.list_price.desc().nullslast())
            .limit(limit)
        )
        listings = q.all()
        if not listings:
            return _fetch_local_bounds(lat_min, lat_max, lng_min, lng_max, limit, lightweight=lightweight or limit > MAX_RESULTS)
        return jsonify(
            {
                "listings": [_serialize_listing(l, lightweight=lightweight or limit > MAX_RESULTS) for l in listings],
                "total": len(listings),
                "page": 1,
                "per_page": limit,
            }
        )
    except OperationalError:
        return _fetch_local_bounds(lat_min, lat_max, lng_min, lng_max, limit, lightweight=lightweight or limit > MAX_RESULTS)


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
                MlsListing.has_photos_filter(),
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
