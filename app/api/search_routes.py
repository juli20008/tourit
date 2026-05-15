from sqlalchemy.orm import selectinload
from sqlalchemy import or_, case
from flask import Blueprint, request
from app.models import Property, State
from app.models.mls_listing import MlsListing
from app.rate_limit import rate_limit_check

search_routes = Blueprint('search', __name__)
search_routes.before_request(rate_limit_check)

_PROPERTY_OPTS = [
    selectinload(Property.state),
    selectinload(Property.listing_agent),
    selectinload(Property.images),
]

MLS_LIMIT = 100   # hard cap per Section 6.3b
PROP_LIMIT = 10   # keep a handful of seeded properties alongside MLS data


@search_routes.route("/areas", methods=["POST"])
def search_by_area():
    ne_lat = float(request.json["neLat"])
    ne_lng = float(request.json["neLng"])
    sw_lat = float(request.json["swLat"])
    sw_lng = float(request.json["swLng"])

    mls = (
        MlsListing.query
        .filter(
            MlsListing.lat.between(sw_lat, ne_lat),
            MlsListing.lng.between(sw_lng, ne_lng),
            MlsListing.list_price.isnot(None),
            MlsListing.visible_filter(),
        )
        .limit(MLS_LIMIT)
        .all()
    )

    results = [l.to_frontend_dict() for l in mls]
    return {"properties": results}


@search_routes.route("/<term>")
def search_by_term(term):
    parsed = " ".join(term.split("-"))
    suggest = request.args.get("suggest", "").strip() == "1"
    results = _mls_by_term(parsed, suggest=suggest)
    return {"properties": results or []}


def _mls_by_term(parsed: str, suggest: bool = False) -> list:
    """Search mls_listings by MLS #, city, neighbourhood, street name, or postal code.

    suggest=True returns 6 lightweight map-pin dicts filtered to Ontario for typeahead.
    Relies on pg_trgm GIN indexes on city, neighborhood, street_name, mls_number.
    """
    limit = 6 if suggest else MLS_LIMIT

    text_filter = or_(
        MlsListing.mls_number.ilike(f"%{parsed}%"),
        MlsListing.city.ilike(f"%{parsed}%"),
        MlsListing.neighborhood.ilike(f"%{parsed}%"),
        MlsListing.street_name.ilike(f"%{parsed}%"),
        MlsListing.zip.ilike(f"{parsed}%"),
    )

    filters = [
        text_filter,
        MlsListing.list_price.isnot(None),
        MlsListing.visible_filter(),
    ]
    if suggest:
        # Typeahead only returns Ontario listings (site is GTA-focused).
        # DDF stores the full province name ("Ontario"), not the abbreviation.
        filters.append(MlsListing.state.ilike('ontario'))

    # Exact city or MLS# match floats to top; otherwise sort by price desc
    priority = case(
        (MlsListing.city.ilike(parsed), 0),
        (MlsListing.mls_number.ilike(parsed), 0),
        else_=1,
    )

    rows = (
        MlsListing.query
        .filter(*filters)
        .order_by(priority, MlsListing.list_price.desc())
        .limit(limit)
        .all()
    )

    if suggest:
        return [l.to_map_pin_dict() for l in rows]
    return [l.to_frontend_dict() for l in rows]


@search_routes.route("/terms", methods=["GET"])
def search_terms():
    props = Property.query.all()
    prop_terms = (
        [p.street for p in props]
        + [p.city for p in props]
        + [p.zip for p in props]
    )

    mls_cities = [
        r[0] for r in
        MlsListing.query.with_entities(MlsListing.city)
        .filter(MlsListing.city.isnot(None), MlsListing.city != '')
        .distinct()
        .limit(300)
        .all()
    ]

    mls_neighborhoods = [
        r[0] for r in
        MlsListing.query.with_entities(MlsListing.neighborhood)
        .filter(MlsListing.neighborhood.isnot(None), MlsListing.neighborhood != '')
        .distinct()
        .limit(500)
        .all()
    ]

    terms = sorted(set(prop_terms + mls_cities + mls_neighborhoods), key=str.casefold)
    return {"terms": terms}
