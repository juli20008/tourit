from flask import Blueprint, jsonify, request
from ..models.mls_agent import MlsAgent

mls_agent_routes = Blueprint('mls_agents', __name__)


@mls_agent_routes.route('/', methods=['GET'])
def list_mls_agents():
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 20, type=int), 100)
    city = request.args.get('city', '').strip()
    name = request.args.get('name', '').strip()
    license_id = request.args.get('license_id', '').strip()

    q = MlsAgent.query

    if city:
        q = q.filter(MlsAgent.city.ilike(f'%{city}%'))
    if name:
        q = q.filter(MlsAgent.full_name.ilike(f'%{name}%'))
    if license_id:
        q = q.filter(MlsAgent.license_id == license_id)

    paginated = q.order_by(MlsAgent.full_name).paginate(
        page=page, per_page=per_page, error_out=False
    )

    return jsonify({
        'agents': [a.to_dict() for a in paginated.items],
        'total': paginated.total,
        'pages': paginated.pages,
        'page': page,
        'per_page': per_page,
    })


@mls_agent_routes.route('/nearby', methods=['GET'])
def nearby_mls_agents():
    """Return agents within a bounding box: ?lat_min=&lat_max=&lng_min=&lng_max="""
    try:
        lat_min = float(request.args['lat_min'])
        lat_max = float(request.args['lat_max'])
        lng_min = float(request.args['lng_min'])
        lng_max = float(request.args['lng_max'])
    except (KeyError, ValueError):
        return jsonify({'error': 'lat_min, lat_max, lng_min, lng_max are required numbers'}), 400

    limit = min(request.args.get('limit', 50, type=int), 200)

    agents = (
        MlsAgent.query
        .filter(
            MlsAgent.lat.between(lat_min, lat_max),
            MlsAgent.lng.between(lng_min, lng_max),
        )
        .limit(limit)
        .all()
    )

    return jsonify({'agents': [a.to_dict() for a in agents]})


@mls_agent_routes.route('/<string:repliers_id>', methods=['GET'])
def get_mls_agent(repliers_id):
    agent = MlsAgent.query.filter_by(repliers_id=repliers_id).first_or_404()
    return jsonify(agent.to_dict())
