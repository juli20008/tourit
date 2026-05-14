import os
import re
from flask import Blueprint, jsonify, session, request, redirect, url_for
from app.models import User, db
from app.forms import LoginForm
from app.forms import SignUpForm, UserUpdateForm
from app.oauth_client import oauth
from flask_login import current_user, login_user, logout_user, login_required
from app.s3_helpers import (
    upload_file_to_s3, allowed_file, get_unique_filename)

_ALLOWED_RETURN_RE = re.compile(
    r'^https?://(localhost(:\d+)?|[a-z0-9-]+\.tourit\.ca)(\/.*)?$',
    re.IGNORECASE,
)

def _safe_return_url(url, fallback):
    """Return url if it's within tourit.ca/localhost, else fallback."""
    if url and _ALLOWED_RETURN_RE.match(url):
        return url
    return fallback


auth_routes = Blueprint('auth', __name__)


def validation_errors_to_error_messages(validation_errors):
    """
    Simple function that turns the WTForms validation errors into a simple list
    """
    errorMessages = []
    for field in validation_errors:
        for error in validation_errors[field]:
            errorMessages.append(f'{field} : {error}')
    return errorMessages


@auth_routes.route('/', methods=['GET', "PUT"])
def authenticate():
    """
    Authenticates a user.
    """
    if request.method == 'GET':
        if current_user.is_authenticated:
            if current_user.agent:
                # Eager-load review.user so to_dict() doesn't fire N+1 queries.
                from sqlalchemy.orm import joinedload
                from app.models.review import Review
                user = (
                    User.query
                    .options(
                        joinedload(User.agent_reviews).joinedload(Review.user),
                        joinedload(User.areas),
                        joinedload(User.availabilities),
                    )
                    .filter(User.id == current_user.id)
                    .first()
                )
                return user.to_dict()
            return current_user.to_dict()
        return {'errors': ['Unauthorized']}

    if request.method == "PUT":
        form = UserUpdateForm()
        form['csrf_token'].data = request.cookies['csrf_token']
        if form.validate_on_submit():

            user = User.query.filter(User.id == current_user.id).first()
            user.username = form.data['username']


            if current_user.agent:
                license_exists = User.query.filter(User.license_num == form.data['license_num'], User.id != current_user.id).first()

                if license_exists:
                    return {"errors": ["License number belongs to another agent"]}

                user.phone = form.data["phone"]
                user.license_num = form.data["license_num"]
                user.office = form.data["office"]
                user.bio = form.data["bio"]

            db.session.commit()

            return {"user": user.to_dict()}
        return {'errors': validation_errors_to_error_messages(form.errors)}, 401


@auth_routes.route('/login', methods=['POST'])
def login():
    """
    Logs a user in
    """
    payload = request.get_json(silent=True) or {}
    if payload:
        email = payload.get("email", "").strip()
        password = payload.get("password", "")
        user = User.query.filter(User.email == email).first()

        if user and user.check_password(password):
            login_user(user)
            return user.to_dict()

        return {'errors': ["Invalid email or password"]}, 401

    form = LoginForm()
    # Get the csrf_token from the request cookie and put it into the
    # form manually to validate_on_submit can be used
    form['csrf_token'].data = request.cookies.get('csrf_token')
    if form.validate_on_submit():
        # Add the user to the session, we are logged in!
        user = User.query.filter(User.email == form.data['email']).first()
        login_user(user)
        return user.to_dict()
    return {'errors': ["Invalid email or password"]}, 401


@auth_routes.route('/logout')
def logout():
    """
    Logs a user out
    """
    logout_user()
    return {'message': 'User logged out'}


@auth_routes.route('/signup', methods=['POST'])
def sign_up():
    """
    Creates a new user and logs them in
    """
    form = SignUpForm()
    form['csrf_token'].data = request.cookies.get('csrf_token')
    if form.validate_on_submit():

        user = User(
            username=form.data['username'],
            email=form.data['email'],
            password=form.data['password'],
            agent=form.data['agent'],
        )
        db.session.add(user)
        db.session.commit()
        login_user(user)
        return user.to_dict()
    return {'errors': validation_errors_to_error_messages(form.errors)}, 401


@auth_routes.route('/google')
def google_login():
    return_to = request.args.get('return_to', '')
    if return_to and (return_to.startswith('/') or _ALLOWED_RETURN_RE.match(return_to)):
        session['google_return_to'] = return_to
    redirect_uri = url_for('auth.google_callback', _external=True)
    return oauth.google.authorize_redirect(redirect_uri)


@auth_routes.route('/google/callback')
def google_callback():
    frontend_url = os.environ.get('FRONTEND_URL', 'http://localhost:3000')
    return_to = session.pop('google_return_to', '')
    try:
        token = oauth.google.authorize_access_token()
    except Exception:
        return redirect(f'{frontend_url}?auth_error=1')

    user_info = token.get('userinfo')
    if not user_info:
        return redirect(f'{frontend_url}?auth_error=1')

    google_id = user_info['sub']
    email = user_info.get('email', '')

    # Find by google_id first, then by email (link existing account)
    user = User.query.filter_by(google_id=google_id).first()
    if not user:
        user = User.query.filter_by(email=email).first()
        if user:
            user.google_id = google_id
            if not user.photo:
                user.photo = user_info.get('picture')
        else:
            # New user — derive a unique username from their Google name
            base = (user_info.get('name') or email.split('@')[0]).replace(' ', '')
            username, suffix = base, 1
            while User.query.filter_by(username=username).first():
                username = f'{base}{suffix}'
                suffix += 1

            user = User(
                username=username,
                email=email,
                google_id=google_id,
                photo=user_info.get('picture'),
            )
            db.session.add(user)
        db.session.commit()

    login_user(user)
    if return_to:
        target = _safe_return_url(return_to, None)
        if target:
            return redirect(target)
        if return_to.startswith('/'):
            return redirect(f'{frontend_url}{return_to}')
    return redirect(frontend_url)


@auth_routes.route('/agent-magic-link', methods=['POST'])
def agent_magic_link():
    """Send a one-time login link to an agent's email address."""
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()

    if not email:
        return {'errors': ['Email is required']}, 400

    user = User.query.filter_by(email=email).first()
    if not user or not user.agent:
        return {'errors': ['No agent account found with that email address.']}, 404

    from app.models.magic_link_token import MagicLinkToken
    from app.utils.mailer import send_magic_link
    token = MagicLinkToken.create_for_user(user.id)
    magic_url = url_for('auth.magic_link_login', token=token, _external=True)
    try:
        send_magic_link(user.email, magic_url)
    except RuntimeError as e:
        return {'errors': [str(e)]}, 500

    return {'message': 'Login link sent. Check your email.'}


@auth_routes.route('/magic-link/<token>')
def magic_link_login(token):
    """Validate a magic-link token, log the agent in, and redirect to the dashboard."""
    from app.models.magic_link_token import MagicLinkToken
    frontend_url = os.environ.get('FRONTEND_URL', 'http://localhost:3000')

    user = MagicLinkToken.consume(token)
    if not user or not user.agent:
        return redirect(f'{frontend_url}/agent-login?error=invalid')

    login_user(user)
    slug = re.sub(r'[^a-zA-Z0-9]', '', user.username or '').lower()
    if slug and frontend_url and 'tourit.ca' in frontend_url:
        return redirect(f'https://{slug}.tourit.ca/appointments')
    return redirect(f'{frontend_url}/appointments')


@auth_routes.route('/unauthorized')
def unauthorized():
    """
    Returns unauthorized JSON when flask-login authentication fails
    """
    return {'errors': ['Unauthorized']}, 401


@auth_routes.route("/photo", methods=['POST'])
@login_required
def upload_photo():
    if "image" not in request.files:
        return {"errors": ["image required"]}, 400

    image = request.files["image"]

    if not allowed_file(image.filename):
        return {"errors": ["file type not permitted"]}, 400

    image.filename = get_unique_filename(image.filename)

    upload = upload_file_to_s3(image)

    if "url" not in upload:
        # if the dictionary doesn't have a url key
        # it means that there was an error when we tried to upload
        # so we send back that error message
        return upload, 400

    url = upload["url"]
    # flask_login allows us to get the current user from the request
    user = User.query.get(current_user.id)

    user.photo = url
    db.session.commit()

    return {"url": url}
