import re
import time
from collections import defaultdict
from threading import Lock
from flask import request, jsonify

_buckets: dict = defaultdict(lambda: {"count": 0, "window_start": 0.0})
_lock = Lock()

RATE_LIMIT = 200  # max requests per window
WINDOW_SECS = 60  # sliding window in seconds

_ALLOWED_ORIGINS = re.compile(
    r"^(https?://localhost(:\d+)?|https://(www\.)?tourit\.ca|https://[a-z0-9-]+\.tourit\.ca)$"
)

# Endpoints that return cached data and never stress the DB.
# Exempting them means page-load bursts don't eat the rate-limit budget.
_EXEMPT_PATHS = {"/api/listings/pin-index", "/api/search/terms"}


def _client_ip() -> str:
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr or "unknown"


def _cors_headers():
    origin = request.headers.get("Origin", "")
    if _ALLOWED_ORIGINS.match(origin):
        return {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-CSRFToken",
            "Vary": "Origin",
        }
    return {}


def rate_limit_check():
    """Before-request hook — returns 429 response if IP exceeds limit."""
    # OPTIONS preflight must never be rate-limited: a non-2xx preflight response
    # fails the CORS check even when the origin is whitelisted.
    if request.method == "OPTIONS":
        return None

    # Cached/static endpoints are exempt — they don't hit the DB.
    if request.path in _EXEMPT_PATHS:
        return None

    ip = _client_ip()
    now = time.monotonic()
    with _lock:
        bucket = _buckets[ip]
        if now - bucket["window_start"] >= WINDOW_SECS:
            bucket["count"] = 1
            bucket["window_start"] = now
        else:
            bucket["count"] += 1
        if bucket["count"] > RATE_LIMIT:
            resp = jsonify({"error": "Too many requests — rate limit exceeded"})
            resp.status_code = 429
            resp.headers["Retry-After"] = str(WINDOW_SECS)
            # Explicitly attach CORS headers so the browser can read the error
            # response. Flask's after_request may not run when before_request
            # short-circuits, so we attach them manually here.
            for k, v in _cors_headers().items():
                resp.headers[k] = v
            return resp
    return None
