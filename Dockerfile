# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — build React SPA
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-slim AS frontend

WORKDIR /build

# Install dependencies first (layer-cache friendly)
COPY react-app/package*.json ./
RUN npm ci --legacy-peer-deps

COPY react-app/ ./
# Cross-platform OpenSSL fix for react-scripts 5 on Node 20
ENV NODE_OPTIONS=--openssl-legacy-provider
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — Python production image
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.12-slim AS backend

# Prevent .pyc files and force stdout/stderr flush
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FLASK_APP=app \
    FLASK_ENV=production \
    PORT=10000

WORKDIR /var/www

# Install Python deps before copying app code (layer-cache friendly)
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy application + migrations
COPY app/ ./app/
COPY migrations/ ./migrations/
COPY wsgi.py ./

# Embed the pre-built React SPA into Flask's static folder
COPY --from=frontend /build/build ./app/static

# Run as a non-root user (security best practice)
RUN useradd --system --create-home appuser \
    && chown -R appuser:appuser /var/www
USER appuser

# Render health-check (the root route serves index.html)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c \
        "import urllib.request, os; \
         urllib.request.urlopen('http://localhost:' + os.environ.get('PORT','10000') + '/')" \
        || exit 1

EXPOSE ${PORT}

# Run migrations then start the server
# eventlet worker required by Flask-SocketIO; -w 1 is mandatory with eventlet
CMD flask db upgrade && gunicorn \
        --worker-class eventlet \
        --workers 1 \
        --bind "0.0.0.0:${PORT}" \
        --timeout 120 \
        --keep-alive 5 \
        --log-level info \
        --access-logfile - \
        --error-logfile - \
        wsgi:app
