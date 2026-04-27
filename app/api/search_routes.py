from sqlalchemy.orm import selectinload
from flask import Blueprint, request
from app.models import Property, State
from app.models.mls_listing import MlsListing

search_routes = Blueprint('search', __name__)

_PROPERTY_OPTS = [
    selectinload(Property.state),
    selectinload(Property.listing_agent),
    selectinload(Property.images),
]

MLS_LIMIT = 490   # max MLS results per search
PROP_LIMIT = 10   # keep a handful of seeded properties alongside MLS data


@search_routes.route("/areas", methods=["POST"])
def search_by_area():
    ne_lat = float(request.json["neLat"])
    ne_lng = float(request.json["neLng"])
    sw_lat = float(request.json["swLat"])
    sw_lng = float(request.json["swLng"])

    # MLS listings within the same bounding box
    mls = (
        MlsListing.query
        .filter(
            MlsListing.lat.between(sw_lat, ne_lat),
            MlsListing.lng.between(sw_lng, ne_lng),
            MlsListing.list_price.isnot(None),
        )
        .limit(MLS_LIMIT)
        .all()
    )

    results = [l.to_frontend_dict() for l in mls]

    return {"properties": results}


@search_routes.route("/<term>")
def search_by_term(term):
    parsed = " ".join(term.split("-"))

    # Prefer MLS listings so the frontend renders the unique Supabase images.
    results = _mls_by_term(parsed)
    if not results:
        results = []

    return {"properties": results}


def _mls_by_term(parsed: str) -> list:
    """Search mls_listings by street, city, or zip and return frontend dicts."""
    from sqlalchemy import or_
    rows = (
        MlsListing.query
        .filter(
            or_(
                MlsListing.city.ilike(f"%{parsed}%"),
                MlsListing.street_name.ilike(f"%{parsed}%"),
                MlsListing.zip.ilike(f"%{parsed}%"),
            ),
            MlsListing.list_price.isnot(None),
        )
        .limit(MLS_LIMIT)
        .all()
    )
    return [l.to_frontend_dict() for l in rows]


@search_routes.route("/terms", methods=["GET"])
def search_terms():
    props = Property.query.all()
    prop_terms = (
        [p.street for p in props]
        + [p.city for p in props]
        + [p.zip for p in props]
    )

    # Pull distinct MLS cities for autocomplete
    mls_cities = [
        r[0] for r in
        MlsListing.query.with_entities(MlsListing.city)
        .filter(MlsListing.city.isnot(None))
        .distinct()
        .limit(500)
        .all()
    ]

    terms = sorted(set(prop_terms + mls_cities), key=str.casefold)
    return {"terms": terms}
