FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FLASK_APP=app \
    FLASK_ENV=production \
    PORT=8080

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /var/www

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/
COPY migrations/ ./migrations/
COPY wsgi.py ./

RUN useradd --system --create-home appuser \
    && chown -R appuser:appuser /var/www
USER appuser

EXPOSE ${PORT}

CMD exec gunicorn --worker-class eventlet --workers 1 --bind 0.0.0.0:${PORT:-8080} --timeout 300 --keep-alive 5 --log-level info --access-logfile - --error-logfile - wsgi:app
