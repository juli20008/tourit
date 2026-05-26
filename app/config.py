import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ECHO = False
    STRICT_SLASHES = False

    # Cross-origin session cookie (Vercel frontend → Render backend).
    # SameSite=None requires Secure=True; only enable in production.
    _is_prod = os.environ.get('FLASK_ENV') == 'production'
    SESSION_COOKIE_SAMESITE = 'None' if _is_prod else 'Lax'
    SESSION_COOKIE_SECURE = _is_prod

    _db_url = os.environ.get('DATABASE_URL', '').strip()
    _force_local_db = os.environ.get('FORCE_LOCAL_DB', '').strip() == '1'
    _local_db = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'instance', 'yillow.db'))
    if _db_url and not _force_local_db:
        SQLALCHEMY_DATABASE_URI = _db_url.replace('postgres://', 'postgresql://')
        # pool_pre_ping: validate connection before use — prevents stale-connection
        # errors after idle periods (Supabase closes idle connections at ~5 min).
        # pool_recycle: force-replace connections older than 4 min so they're never
        # handed back to the app already dead.
        SQLALCHEMY_ENGINE_OPTIONS = {
            'pool_pre_ping': True,
            'pool_recycle': 90,
            'pool_size': 5,
            'max_overflow': 10,
        }
    else:
        SQLALCHEMY_DATABASE_URI = f"sqlite:///{_local_db}"

    SUPABASE_URL = os.environ.get('SUPABASE_URL')
    SUPABASE_SERVICE_ROLE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    MAX_CONTENT_LENGTH = 100 * 1024 * 1024  # 100 MB — for video uploads
