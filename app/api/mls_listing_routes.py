from flask import Blueprint, jsonify, request
from ..models.mls_listing import MlsListing

mls_listing_routes = Blueprint('mls_listings', __name__)

MAX_RESULTS = 100  # hard cap per Section 6.3b


@mls_listing_routes.route('/', methods=['GET'])
def list_listings():
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

    q = q.order_by(MlsListing.list_date.desc().nullslast())

    offset = (page - 1) * per_page
    # Refuse to serve rows beyond the 100-result cap
    if offset >= MAX_RESULTS:
        return jsonify({'listings': [], 'total': MAX_RESULTS, 'pages': MAX_RESULTS // per_page, 'page': page, 'per_page': per_page})

    # Trim the page so offset + per_page never exceeds 100
    per_page = min(per_page, MAX_RESULTS - offset)
    items = q.offset(offset).limit(per_page).all()
    total = min(q.count(), MAX_RESULTS)
    pages = (total + per_page - 1) // per_page if per_page > 0 else 0

    return jsonify({
        'listings': [l.to_dict() for l in items],
        'total': total,
        'pages': pages,
        'page': page,
        'per_page': per_page,
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
    listing = MlsListing.query.filter_by(mls_number=mls_number).first_or_404()
    return jsonify(listing.to_dict())
