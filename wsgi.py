"""
Render / gunicorn entry point.

Render's start command:   gunicorn wsgi:app
Or with eventlet:         gunicorn --worker-class eventlet -w 1 wsgi:app
"""
import threading
from app import app  # noqa: F401  (re-export for gunicorn)


def _warmup_caches():
    """Pre-populate expensive caches in the background after gunicorn starts.

    Runs 3 s after startup so gunicorn finishes its own initialization first.
    With eventlet the sleep is non-blocking — it yields to other green threads.
    """
    import time
    time.sleep(3)
    with app.app_context():
        try:
            from app.api.mls_listing_routes import gta_spread, pin_index
            gta_spread()   # fills _cache["gta_spread"]
            pin_index()    # fills _pin_index_cache
        except Exception:
            pass


threading.Thread(target=_warmup_caches, daemon=True).start()


if __name__ == "__main__":
    app.run()
