import time
from collections import defaultdict
from threading import Lock
from flask import request, jsonify

_buckets: dict = defaultdict(lambda: {"count": 0, "window_start": 0.0})
_lock = Lock()

RATE_LIMIT = 200  # max requests per window
WINDOW_SECS = 60  # sliding window in seconds


def _client_ip() -> str:
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr or "unknown"


def rate_limit_check():
    """Before-request hook — returns 429 response if IP exceeds limit."""
    # OPTIONS preflight must not be rate-limited — a 429 here fails the CORS check
    # even when the origin is whitelisted, blocking all subsequent requests.
    if request.method == "OPTIONS":
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
            return resp
    return None
