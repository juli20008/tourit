from flask import Blueprint, jsonify, request
import os
from sqlalchemy.orm import selectinload
from ..models.mls_listing import MlsListing
from app.models.property import Property
from ..rate_limit import rate_limit_check

mls_listing_routes = Blueprint('mls_listings', __name__)
mls_listing_routes.before_request(rate_limit_check)

MAX_RESULTS = 100  # hard cap per Section 6.3b
MAX_MAP_RESULTS = 1000
USE_LOCAL_PROPERTIES = os.environ.get('FORCE_LOCAL_DB', '').strip() == '1'


def _property_query():
    return (
        Property.query.options(
            selectinload(Property.state),
            selectinload(Property.images),
        )
        .order_by(Property.listing_date.desc(), Property.price.desc())
    )


def _serialize_property(property_obj, lightweight: bool = False):
    data = {
        'id': f'mls_{property_obj.id}',
        'is_mls': True,
        'mls_number': property_obj.listing_id,
        'status': property_obj.status,
        'type': property_obj.type,
        'style': property_obj.type or '',
        'property_type': property_obj.type or '',
        'transaction_type': '',
        'property_class': '',
        'price': property_obj.price,
        'sold_price': None,
        'original_price': None,
        'bed': property_obj.bed,
        'bath': float(property_obj.bath) if property_obj.bath is not None else 0,
        'sqft': property_obj.sqft,
        'lot': property_obj.lot,
        'built': property_obj.built,
        'garage': property_obj.garage,
        'street': property_obj.street,
        'unit': '',
        'city': property_obj.city or '',
        'state': property_obj.state.state if getattr(property_obj, 'state', None) else '',
        'zip': property_obj.zip or '',
        'neighborhood': '',
        'listing_id': property_obj.listing_id,
        'listing_date': property_obj.listing_date.isoformat() if property_obj.listing_date else None,
        'updated_at': None,
        'description': property_obj.description,
        'listing_agent_id': property_obj.listing_agent_id,
        'office': '',
        'brokerage': '',
        'agent_name': '',
        'agent_email': '',
        'front_img': property_obj.front_img,
        'images': [image.id for image in property_obj.images],
        'image_urls': [image.img_url for image in property_obj.images],
        'lat': property_obj.lat,
        'lng': property_obj.long,
    }
    if lightweight:
        data.pop('description', None)
        data.pop('images', None)
        data.pop('image_urls', None)
    return data


def _serialize_listing(listing: MlsListing, lightweight: bool = False):
    return listing.to_frontend_light_dict() if lightweight else listing.to_frontend_dict()


@mls_listing_routes.route('/', methods=['GET'])
def list_listings():
    if USE_LOCAL_PROPERTIES:
        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 20, type=int), MAX_RESULTS)
        offset = (page - 1) * per_page
        items = _property_query().offset(offset).limit(per_page).all()
        total = min(Property.query.count(), MAX_RESULTS)
        pages = (total + per_page - 1) // per_page if per_page > 0 else 0
        return jsonify({
            'listings': [_serialize_property(p, lightweight=False) for p in items],
            'total': total,
            'pages': pages,
            'page': page,
            'per_page': per_page,
        })

    view = request.args.get('view', '').strip().lower()
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 20, type=int), MAX_RESULTS)
    city = request.args.get('city', '').strip()
    status = request.args.get('status', '').strip()
    min_price = request.args.get('min_price', type=int)
    max_price = request.args.get('max_price', type=int)
    min_bed = request.args.get('min_bed', type=int)
    t_type = request.args.get('type', '').strip()  # Sale / Lease

    q = MlsListing.query
    if city:
        q = q.filter(MlsListing.city.ilike(f'%{city}%'))
    if status:
        q = q.filter(MlsListing.standard_status.ilike(f'%{status}%'))
    if min_price:
        q = q.filter(MlsListing.list_price >= min_price)
    if max_price:
        q = q.filter(MlsListing.list_price <= max_price)
    if min_bed:
        q = q.filter(MlsListing.bed >= min_bed)
    if t_type:
        q = q.filter(MlsListing.transaction_type.ilike(f'%{t_type}%'))

    q = q.order_by(MlsListing.updated_at.desc().nullslast(), MlsListing.list_price.desc().nullslast())

    lightweight = view == 'map'
    if lightweight:
        per_page = min(request.args.get('per_page', MAX_MAP_RESULTS, type=int), MAX_MAP_RESULTS)

    offset = (page - 1) * per_page
    # Refuse to serve rows beyond the 100-result cap
    if not lightweight and offset >= MAX_RESULTS:
        return jsonify({'listings': [], 'total': MAX_RESULTS, 'pages': MAX_RESULTS // per_page, 'page': page, 'per_page': per_page})

    # Trim the page so offset + per_page never exceeds 100
    if not lightweight:
        per_page = min(per_page, MAX_RESULTS - offset)
    items = q.offset(offset).limit(per_page).all()
    total = min(q.count(), MAX_RESULTS)
    if lightweight:
        total = min(q.count(), MAX_MAP_RESULTS)
    pages = (total + per_page - 1) // per_page if per_page > 0 else 0

    return jsonify({
        'listings': [_serialize_listing(l, lightweight=lightweight) for l in items],
        'total': total,
        'pages': pages,
        'page': page,
        'per_page': per_page,
    })


@mls_listing_routes.route('/', methods=['POST'])
def list_listings_by_bounds():
    payload = request.get_json(silent=True) or {}
    view = (request.args.get('view') or payload.get('view') or '').strip().lower()

    if USE_LOCAL_PROPERTIES:
        try:
            lat_min = float(payload['lat_min']) if 'lat_min' in payload else float(payload['swLat'])
            lat_max = float(payload['lat_max']) if 'lat_max' in payload else float(payload['neLat'])
            lng_min = float(payload['lng_min']) if 'lng_min' in payload else float(payload['swLng'])
            lng_max = float(payload['lng_max']) if 'lng_max' in payload else float(payload['neLng'])
        except (KeyError, TypeError, ValueError):
            return jsonify({'error': 'lat_min, lat_max, lng_min, lng_max required'}), 400

        try:
            limit = min(int(payload.get('limit', MAX_MAP_RESULTS) or MAX_MAP_RESULTS), MAX_MAP_RESULTS)
        except (TypeError, ValueError):
            limit = MAX_MAP_RESULTS

        listings = (
            _property_query()
            .filter(
                Property.lat.between(lat_min, lat_max),
                Property.long.between(lng_min, lng_max),
            )
            .limit(limit)
            .all()
        )
        return jsonify({
            'listings': [_serialize_property(p, lightweight=view == 'map' or limit > MAX_RESULTS) for p in listings],
            'total': len(listings),
            'page': 1,
            'per_page': limit,
        })

    try:
        if all(key in payload for key in ('lat_min', 'lat_max', 'lng_min', 'lng_max')):
            lat_min = float(payload['lat_min'])
            lat_max = float(payload['lat_max'])
            lng_min = float(payload['lng_min'])
            lng_max = float(payload['lng_max'])
        elif all(key in payload for key in ('neLat', 'swLat', 'neLng', 'swLng')):
            lat_min = float(payload['swLat'])
            lat_max = float(payload['neLat'])
            lng_min = float(payload['swLng'])
            lng_max = float(payload['neLng'])
        else:
            return jsonify({'error': 'lat_min, lat_max, lng_min, lng_max required'}), 400
    except (KeyError, TypeError, ValueError):
        return jsonify({'error': 'lat_min, lat_max, lng_min, lng_max required'}), 400

    try:
        limit = min(int(payload.get('limit', MAX_MAP_RESULTS) or MAX_MAP_RESULTS), MAX_MAP_RESULTS)
    except (TypeError, ValueError):
        limit = MAX_MAP_RESULTS
    lightweight = view == 'map' or limit > MAX_RESULTS

    q = (
        MlsListing.query
        .filter(
            MlsListing.lat.between(lat_min, lat_max),
            MlsListing.lng.between(lng_min, lng_max),
            MlsListing.list_price.isnot(None),
        )
        .order_by(MlsListing.updated_at.desc().nullslast(), MlsListing.list_price.desc().nullslast())
        .limit(limit)
    )

    listings = q.all()
    return jsonify({
        'listings': [_serialize_listing(l, lightweight=lightweight) for l in listings],
        'total': len(listings),
        'page': 1,
        'per_page': limit,
    })


@mls_listing_routes.route('/nearby', methods=['GET'])
def nearby_listings():
    """Bounding-box search: ?lat_min=&lat_max=&lng_min=&lng_max="""
    try:
        lat_min = float(request.args['lat_min'])
        lat_max = float(request.args['lat_max'])
        lng_min = float(request.args['lng_min'])
        lng_max = float(request.args['lng_max'])
    except (KeyError, ValueError):
        return jsonify({'error': 'lat_min, lat_max, lng_min, lng_max required'}), 400

    limit = min(request.args.get('limit', 50, type=int), MAX_RESULTS)

    listings = (
        MlsListing.query
        .filter(
            MlsListing.lat.between(lat_min, lat_max),
            MlsListing.lng.between(lng_min, lng_max),
        )
        .order_by(MlsListing.list_price)
        .limit(limit)
        .all()
    )
    return jsonify({'listings': [l.to_dict() for l in listings]})


@mls_listing_routes.route('/<string:mls_number>', methods=['GET'])
def get_listing(mls_number):
    if USE_LOCAL_PROPERTIES:
        try:
            pid = int(mls_number)
        except (TypeError, ValueError):
            return jsonify({'listing': None}), 404
        listing = Property.query.options(
            selectinload(Property.state),
            selectinload(Property.images),
        ).get(pid)
        if not listing:
            return jsonify({'listing': None}), 404
        return jsonify({'listing': _serialize_property(listing, lightweight=False)})

    listing = MlsListing.query.filter_by(mls_number=mls_number).first_or_404()
    return jsonify({'listing': listing.to_frontend_dict()})
