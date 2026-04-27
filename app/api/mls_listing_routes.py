from flask import Blueprint, jsonify, request
from ..models.mls_listing import MlsListing

mls_listing_routes = Blueprint('mls_listings', __name__)


@mls_listing_routes.route('/', methods=['GET'])
def list_listings():
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 20, type=int), 100)
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

    paginated = q.order_by(MlsListing.list_date.desc().nullslast()).paginate(
        page=page, per_page=per_page, error_out=False
    )

    return jsonify({
        'listings': [l.to_dict() for l in paginated.items],
        'total': paginated.total,
        'pages': paginated.pages,
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

    limit = min(request.args.get('limit', 50, type=int), 200)

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
