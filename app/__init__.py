import os
from flask import Flask, request, redirect, jsonify, send_from_directory
from flask_cors import CORS
from flask_migrate import Migrate
from flask_wtf.csrf import CSRFProtect, generate_csrf
from flask_login import LoginManager

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
from .api.sync_routes import sync_routes

from .seeds import seed_commands
from .commands import repliers_commands

from .config import Config

app = Flask(__name__, static_folder='/var/www/static', static_url_path='/')

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
app.register_blueprint(sync_routes, url_prefix='/api/sync')
app.cli.add_command(repliers_commands)
db.init_app(app)
Migrate(app, db)
socketio.init_app(app)

# Application Security
# Hardcode known origins + pick up any extras from FRONTEND_URL env var.
_allowed_origins = list({
    "http://localhost:3000",
    "https://yillow.vercel.app",   # legacy — keep until DNS cutover
    "https://tourit.ca",
    "https://www.tourit.ca",
    *[o.strip() for o in os.environ.get("FRONTEND_URL", "").split(",") if o.strip()],
})
CORS(app, resources={r"/api/*": {"origins": _allowed_origins}}, supports_credentials=True)


# Since we are deploying with Docker and Flask,
# we won't be using a buildpack when we deploy to Heroku.
# Therefore, we need to make sure that in production any
# request made over http is redirected to https.
# Well.........
@app.before_request
def https_redirect():
    if os.environ.get('FLASK_ENV') == 'production':
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
    return jsonify({'status': 'ok'})


@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if path.startswith('api/'):
        return jsonify({'error': 'Not found'}), 404
    file_path = os.path.join(app.static_folder, path) if path else ''
    if path and os.path.exists(file_path):
        return send_from_directory(app.static_folder, path)
    try:
        return send_from_directory(app.static_folder, 'index.html')
    except Exception:
        return jsonify({'error': 'Frontend not built'}), 404

if __name__ == '__main__':
    socketio.run(app)
