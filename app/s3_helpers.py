import os
import uuid
import requests

ALLOWED_EXTENSIONS = {"pdf", "png", "jpg", "jpeg", "gif", "webp"}
ALLOWED_VIDEO_EXTENSIONS = {"mp4", "mov", "webm", "m4v"}
VIDEO_BUCKET = "live-tour-videos"
MAX_VIDEO_BYTES = 95 * 1024 * 1024   # 95 MB — allows direct uploads from iOS (no compression)


def allowed_file(filename):
    return "." in filename and \
           filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def get_unique_filename(filename):
    ext = filename.rsplit(".", 1)[1].lower()
    return f"{uuid.uuid4().hex}.{ext}"


def _supabase_config():
    # Prefer Flask app config (populated by Config class via load_dotenv);
    # fall back to raw os.environ for contexts outside a request.
    try:
        from flask import current_app
        cfg = current_app.config
        url = cfg.get("SUPABASE_URL") or os.environ.get("SUPABASE_URL", "")
        key = cfg.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    except RuntimeError:
        url = os.environ.get("SUPABASE_URL", "")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    bucket = os.environ.get("SUPABASE_STORAGE_BUCKET", "photos")
    return url.rstrip("/"), key, bucket


def _ensure_bucket(url, key, bucket):
    """Create the bucket if it doesn't exist yet (idempotent)."""
    try:
        resp = requests.post(
            f"{url}/storage/v1/bucket",
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json={"id": bucket, "name": bucket, "public": True},
            timeout=10,
        )
        # 200/201 = created, 409 = already exists — both are fine
        return resp.status_code in (200, 201, 409)
    except Exception:
        return False


def allowed_video(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_VIDEO_EXTENSIONS


def upload_video_to_supabase(file):
    """Upload video to Supabase Storage live-tour-videos bucket."""
    supabase_url, service_key, _ = _supabase_config()
    if not supabase_url or not service_key:
        return {"errors": ["Storage not configured"]}

    _ensure_bucket(supabase_url, service_key, VIDEO_BUCKET)

    filename = get_unique_filename(file.filename)
    content_type = getattr(file, "content_type", None) or "video/mp4"

    try:
        data = file.read()
        if len(data) > MAX_VIDEO_BYTES:
            return {"errors": ["Video too large (max 100 MB)"]}

        resp = requests.post(
            f"{supabase_url}/storage/v1/object/{VIDEO_BUCKET}/{filename}",
            headers={
                "Authorization": f"Bearer {service_key}",
                "Content-Type": content_type,
                "x-upsert": "true",
            },
            data=data,
            timeout=120,
        )
        if resp.status_code not in (200, 201):
            return {"errors": [f"Upload failed ({resp.status_code}): {resp.text[:300]}"]}

        public_url = f"{supabase_url}/storage/v1/object/public/{VIDEO_BUCKET}/{filename}"
        return {"url": public_url}
    except Exception as e:
        return {"errors": [str(e)]}


def delete_from_supabase(url):
    """Delete a file from Supabase Storage given its public URL."""
    supabase_url, service_key, _ = _supabase_config()
    if not supabase_url or not service_key or not url:
        return False

    prefix = f"{supabase_url}/storage/v1/object/public/"
    if not url.startswith(prefix):
        return False

    path = url[len(prefix):]  # e.g. "live-tour-videos/abc123.mp4"
    bucket = path.split("/")[0]
    object_path = "/".join(path.split("/")[1:])

    try:
        resp = requests.delete(
            f"{supabase_url}/storage/v1/object/{bucket}/{object_path}",
            headers={"Authorization": f"Bearer {service_key}"},
            timeout=10,
        )
        return resp.status_code in (200, 204)
    except Exception:
        return False


def upload_file_to_s3(file, acl="public-read"):
    """Upload to Supabase Storage. Keeps the same signature as the old S3 version."""
    supabase_url, service_key, bucket = _supabase_config()

    if not supabase_url or not service_key:
        return {"errors": ["Storage is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)"]}

    if not service_key.startswith("eyJ"):
        return {"errors": ["SUPABASE_SERVICE_ROLE_KEY is not a valid JWT — go to Supabase → Project Settings → API and copy the full service_role key (starts with eyJ)"]}

    _ensure_bucket(supabase_url, service_key, bucket)

    filename = file.filename
    content_type = getattr(file, "content_type", None) or "image/jpeg"

    try:
        data = file.read()
        resp = requests.post(
            f"{supabase_url}/storage/v1/object/{bucket}/{filename}",
            headers={
                "Authorization": f"Bearer {service_key}",
                "Content-Type": content_type,
                "x-upsert": "true",
            },
            data=data,
            timeout=30,
        )
        if resp.status_code not in (200, 201):
            return {"errors": [f"Upload failed ({resp.status_code}): {resp.text[:300]}"]}

        public_url = f"{supabase_url}/storage/v1/object/public/{bucket}/{filename}"
        return {"url": public_url}
    except Exception as e:
        return {"errors": [str(e)]}
