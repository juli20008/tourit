"""
File storage helpers — Cloudflare R2 (S3-compatible via boto3).

Required env vars:
  R2_ENDPOINT        full endpoint URL, e.g. https://<account_id>.r2.cloudflarestorage.com
  S3_KEY             R2 Access Key ID
  S3_SECRET          R2 Secret Access Key
  S3_BUCKET          default bucket name (e.g. "tourit-media")
  R2_PUBLIC_URL      public base URL, e.g. https://media.tourit.ca  (no trailing slash)
                     Falls back to https://pub-<bucket>.r2.dev if not set.
"""
import os
import uuid
import boto3
from botocore.config import Config

ALLOWED_EXTENSIONS = {"pdf", "png", "jpg", "jpeg", "gif", "webp"}
ALLOWED_VIDEO_EXTENSIONS = {"mp4", "mov", "webm", "m4v"}
VIDEO_BUCKET = "live-tour-videos"
MAX_VIDEO_BYTES = 100 * 1024 * 1024  # 100 MB


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def allowed_video(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_VIDEO_EXTENSIONS


def get_unique_filename(filename):
    ext = filename.rsplit(".", 1)[1].lower()
    return f"{uuid.uuid4().hex}.{ext}"


def _r2_client():
    endpoint = os.environ.get("R2_ENDPOINT", "")
    key      = os.environ.get("S3_KEY", "")
    secret   = os.environ.get("S3_SECRET", "")
    if not endpoint or not key or not secret:
        raise RuntimeError("R2 not configured (R2_ENDPOINT / S3_KEY / S3_SECRET missing)")
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=key,
        aws_secret_access_key=secret,
        region_name="auto",
        config=Config(signature_version="s3v4"),
    )


def _r2_public_url(bucket, key):
    base = os.environ.get("R2_PUBLIC_URL", "").rstrip("/")
    if not base:
        base = f"https://pub-{bucket}.r2.dev"
    return f"{base}/{key}"


def _default_bucket():
    return os.environ.get("S3_BUCKET", "tourit-media")


def _upload_bytes(data: bytes, key: str, content_type: str, bucket: str | None = None) -> str:
    """Upload raw bytes to R2. Returns the public URL."""
    bucket = bucket or _default_bucket()
    client = _r2_client()
    client.put_object(Bucket=bucket, Key=key, Body=data, ContentType=content_type)
    return _r2_public_url(bucket, key)


def _upload_file_obj(file_obj, key: str, content_type: str, bucket: str | None = None) -> str:
    """Upload a file-like object to R2. Returns the public URL."""
    bucket = bucket or _default_bucket()
    client = _r2_client()
    client.upload_fileobj(file_obj, bucket, key, ExtraArgs={"ContentType": content_type})
    return _r2_public_url(bucket, key)


def _delete_object(public_url: str):
    """Delete an R2 object given its public URL (best-effort)."""
    base = os.environ.get("R2_PUBLIC_URL", "").rstrip("/")
    bucket = _default_bucket()
    try:
        if base and public_url.startswith(base + "/"):
            key = public_url[len(base) + 1:]
        else:
            key = public_url.rsplit("/", 1)[-1]
        _r2_client().delete_object(Bucket=bucket, Key=key)
    except Exception:
        pass


# ── Legacy-compatible helpers (used by old routes) ─────────────────────────────

def upload_file_to_s3(file, acl="public-read"):
    """Upload a Flask FileStorage to R2. Returns {url} or {errors: [...]}."""
    try:
        data = file.read()
        filename = get_unique_filename(file.filename)
        content_type = getattr(file, "content_type", None) or "image/jpeg"
        url = _upload_bytes(data, filename, content_type)
        return {"url": url}
    except Exception as e:
        return {"errors": [str(e)]}


def upload_video_to_supabase(file):
    """Upload a video file to R2 (was Supabase Storage). Returns {url} or {errors}."""
    try:
        data = file.read()
        if len(data) > MAX_VIDEO_BYTES:
            return {"errors": ["Video too large (max 100 MB)"]}
        filename = get_unique_filename(file.filename or "video.mp4")
        content_type = getattr(file, "content_type", None) or "video/mp4"
        url = _upload_bytes(data, filename, content_type)
        return {"url": url}
    except Exception as e:
        return {"errors": [str(e)]}


def delete_from_supabase(url):
    """Delete a file from R2 given its public URL (was Supabase Storage)."""
    _delete_object(url)
    return True


# Supabase config shim — keeps old callers working (returns empty strings if R2 is used)
def _supabase_config():
    return "", "", ""


def _ensure_bucket(url, key, bucket):
    return True
