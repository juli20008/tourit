import os
import uuid
import requests

ALLOWED_EXTENSIONS = {"pdf", "png", "jpg", "jpeg", "gif", "webp"}


def allowed_file(filename):
    return "." in filename and \
           filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def get_unique_filename(filename):
    ext = filename.rsplit(".", 1)[1].lower()
    return f"{uuid.uuid4().hex}.{ext}"


def _supabase_config():
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    bucket = os.environ.get("SUPABASE_STORAGE_BUCKET", "photos")
    return url, key, bucket


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


def upload_file_to_s3(file, acl="public-read"):
    """Upload to Supabase Storage. Keeps the same signature as the old S3 version."""
    supabase_url, service_key, bucket = _supabase_config()

    if not supabase_url or not service_key:
        return {"errors": ["Storage is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)"]}

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
