"""
Render / gunicorn entry point.

Render's start command:   gunicorn wsgi:app
Or with eventlet:         gunicorn --worker-class eventlet -w 1 wsgi:app
"""
from app import app  # noqa: F401  (re-export for gunicorn)

if __name__ == "__main__":
    app.run()
