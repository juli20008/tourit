import os
import re
from flask import Flask, request, redirect, jsonify, send_from_directory
from flask_compress import Compress
from flask_cors import CORS
from flask_migrate import Migrate
from flask_wtf.csrf import CSRFProtect, generate_csrf
from flask_login import LoginManager
from werkzeug.middleware.proxy_fix import ProxyFix

from .socket import socketio
from .models import db, User
from .oauth_client import oauth
from .api.auth_routes import auth_routes
from .api.property_routes import property_routes
from .api.agent_routes import agent_routes
from .api.appointment_routes import appointment_routes
from .api.review_routes import review_routes
from .api.search_routes import search_routes
from .api.service_area_routes import service_area_routes
from .api.channel_routes import channel_routes
from .api.mls_agent_routes import mls_agent_routes
from .api.mls_listing_routes import mls_listing_routes
from .api.xhs_routes import xhs_routes
from .api.fbmp_routes import fbmp_routes
from .api.live_tour_routes import live_tour_routes
from .api.historical_live_tour_routes import historical_live_tour_routes
from .api.guest_routes import guest_routes
from .api.share_routes import share_routes

from .seeds import seed_commands

from .config import Config

base_dir = os.path.dirname(os.path.abspath(__file__))
static_dir = os.path.abspath(os.path.join(base_dir, '..', 'static'))
app = Flask(__name__, static_folder=static_dir, static_url_path='/')
app.url_map.strict_slashes = False
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)

# Setup login manager
login = LoginManager(app)
login.login_view = 'auth.unauthorized'


@login.user_loader
def load_user(id):
    return User.query.get(int(id))


# Tell flask about our seed commands
app.cli.add_command(seed_commands)

app.config.from_object(Config)

# Google OAuth
oauth.init_app(app)
oauth.register(
    name='google',
    client_id=os.environ.get('GOOGLE_CLIENT_ID'),
    client_secret=os.environ.get('GOOGLE_CLIENT_SECRET'),
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
    client_kwargs={'scope': 'openid email profile'},
)

app.register_blueprint(auth_routes, url_prefix='/api/auth')
app.register_blueprint(property_routes, url_prefix='/api/properties')
app.register_blueprint(agent_routes, url_prefix='/api/agents')
app.register_blueprint(appointment_routes, url_prefix='/api/appointments')
app.register_blueprint(review_routes, url_prefix='/api/reviews')
app.register_blueprint(search_routes, url_prefix='/api/search')
app.register_blueprint(service_area_routes, url_prefix='/api/service_areas')
app.register_blueprint(channel_routes, url_prefix='/api/channels')
app.register_blueprint(mls_agent_routes, url_prefix='/api/mls-agents')
app.register_blueprint(mls_listing_routes, url_prefix='/api/listings')
app.register_blueprint(xhs_routes, url_prefix='/api/xhs')
app.register_blueprint(fbmp_routes, url_prefix='/api/fbmp')
app.register_blueprint(live_tour_routes, url_prefix='/api/live-tours')
app.register_blueprint(historical_live_tour_routes, url_prefix='/api/historical-live-tours')
app.register_blueprint(guest_routes, url_prefix='/api/guest')
app.register_blueprint(share_routes, url_prefix='/share')
db.init_app(app)
Migrate(app, db)
socketio.init_app(app)
Compress(app)

# Application Security
# Hardcode known origins + pick up any extras from FRONTEND_URL env var.
_allowed_origins = list({
    "http://localhost:3000",
    "https://yillow.vercel.app",   # legacy — keep until DNS cutover
    "https://tourit.ca",
    "https://www.tourit.ca",
    re.compile(r"^https://[a-z0-9-]+\.tourit\.ca$"),
    *[o.strip() for o in os.environ.get("FRONTEND_URL", "").split(",") if o.strip()],
})
CORS(app, resources={
    r"/api/*":  {"origins": _allowed_origins},
    r"/warmup": {"origins": _allowed_origins},
    r"/health": {"origins": _allowed_origins},
}, supports_credentials=True)


# Since we are deploying with Docker and Flask,
# we won't be using a buildpack when we deploy to Heroku.
# Therefore, we need to make sure that in production any
# request made over http is redirected to https.
# Well.........
@app.before_request
def https_redirect():
    if os.environ.get('FLASK_ENV') == 'production':
        if request.method == 'OPTIONS':
            return None
        if request.headers.get('X-Forwarded-Proto') == 'http':
            url = request.url.replace('http://', 'https://', 1)
            code = 301
            return redirect(url, code=code)


@app.after_request
def inject_csrf_token(response):
    response.set_cookie(
        'csrf_token',
        generate_csrf(),
        secure=True if os.environ.get('FLASK_ENV') == 'production' else False,
        samesite='Strict' if os.environ.get(
            'FLASK_ENV') == 'production' else None,
        httponly=True)
    return response


@app.route('/health')
def health_check():
    # Must always return 200 — Render restarts the service on non-200,
    # so a transient DB blip must never cause a restart cascade.
    return jsonify({'status': 'ok'}), 200


@app.route('/warmup')
def warmup():
    """Pre-warm Flask + DB connection pool + default GTA map cache."""
    try:
        from sqlalchemy import text
        from .models.mls_listing import MlsListing
        from .api.mls_listing_routes import _cache_get, _cache_set, MAX_MAP_RESULTS

        db.session.execute(text('SELECT 1'))

        # Pre-populate the default Toronto viewport cache so the first real
        # map load hits cache instead of running a cold query.
        # These bounds match DEFAULT_AREA in react-app/src/App.js exactly.
        def _r(x): return round(x, 2)
        DEFAULT = {'lat_min': 43.58, 'lat_max': 43.855, 'lng_min': -79.64, 'lng_max': -79.12}
        cache_key = f"bounds_{_r(DEFAULT['lat_min'])}_{_r(DEFAULT['lat_max'])}_{_r(DEFAULT['lng_min'])}_{_r(DEFAULT['lng_max'])}_"
        if not _cache_get(cache_key):
            listings = (
                MlsListing.query
                .filter(
                    MlsListing.lat.between(DEFAULT['lat_min'], DEFAULT['lat_max']),
                    MlsListing.lng.between(DEFAULT['lng_min'], DEFAULT['lng_max']),
                    MlsListing.map_pin_filter(),
                    MlsListing.property_type_filter(),
                )
                .order_by(MlsListing.updated_at.desc().nullslast(), MlsListing.list_price.desc().nullslast())
                .limit(MAX_MAP_RESULTS)
                .all()
            )
            if listings:
                _cache_set(cache_key, {
                    'listings': [l.to_map_pin_dict() for l in listings],
                    'total': len(listings), 'page': 1, 'per_page': MAX_MAP_RESULTS,
                })

        db.session.remove()
        return jsonify({'status': 'ok', 'db': 'ok'})
    except Exception as e:
        return jsonify({'status': 'ok', 'db': 'error', 'detail': str(e)})



@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if path.startswith('api/'):
        return jsonify({'error': 'Not found'}), 404

    # Share pages — handle here so the catch-all never intercepts them.
    # The blueprint at /share also registers these routes, but the catch-all
    # can win over blueprints depending on Werkzeug's sorting.
    _SHARE_PREFIX = 'share/listing/'
    if path.startswith(_SHARE_PREFIX):
        mls_number = path[len(_SHARE_PREFIX):].strip('/')
        if mls_number:
            from app.api.share_routes import share_listing
            return share_listing(mls_number)

    file_path = os.path.join(app.static_folder, path) if path else ''
    if path and os.path.exists(file_path):
        return send_from_directory(app.static_folder, path)
    try:
        return send_from_directory(app.static_folder, 'index.html')
    except Exception:
        return jsonify({'status': 'ok'}), 200

if __name__ == '__main__':
    socketio.run(app)
