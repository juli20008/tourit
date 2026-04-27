import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ECHO = False

    # Cross-origin session cookie (Vercel frontend → Render backend).
    # SameSite=None requires Secure=True; only enable in production.
    _is_prod = os.environ.get('FLASK_ENV') == 'production'
    SESSION_COOKIE_SAMESITE = 'None' if _is_prod else 'Lax'
    SESSION_COOKIE_SECURE = _is_prod

    _db_url = os.environ.get('DATABASE_URL', '')
    SQLALCHEMY_DATABASE_URI = _db_url.replace('postgres://', 'postgresql://') if _db_url else None

    SUPABASE_URL = os.environ.get('SUPABASE_URL')
    SUPABASE_SERVICE_ROLE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    REPLIERS_API_KEY = os.environ.get('REPLIERS_API_KEY')
