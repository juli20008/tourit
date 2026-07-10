"""
CLI entry point for GitHub Actions video generation.
Usage: python scripts/run_video_job.py <job_id>
"""
import os
import sys

# Load .env if present (local dev only)
_env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
if os.path.exists(_env_path):
    with open(_env_path) as _f:
        for _line in _f:
            _line = _line.strip()
            if not _line or _line.startswith('#') or '=' not in _line:
                continue
            _k, _v = _line.split('=', 1)
            os.environ.setdefault(_k.strip(), _v.strip().strip('"').strip("'"))

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/run_video_job.py <job_id>")
        sys.exit(1)

    job_id = sys.argv[1].strip()
    print(f"[run_video_job] Starting job {job_id}")

    # ── Load job from DB ──────────────────────────────────────────────────────
    import psycopg2
    import psycopg2.extras
    from app.services.xhs_db_jobs import ensure_jobs_table

    db_url = os.environ.get("DATABASE_URL") or os.environ.get("NEON_DATABASE_URL")
    if not db_url:
        print("[run_video_job] ERROR: DATABASE_URL not set")
        sys.exit(1)
    ensure_jobs_table()
    conn = psycopg2.connect(db_url)
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT * FROM xhs_video_jobs WHERE job_id = %s", (job_id,))
        row = cur.fetchone()
    conn.close()

    if not row:
        print(f"[run_video_job] ERROR: Job {job_id} not found in xhs_video_jobs table")
        sys.exit(1)

    row = dict(row)
    mls_number        = row['mls_number']
    agent_id          = row['agent_id']
    cover_lines       = [row.get('cover1') or '', row.get('cover2') or '', row.get('cover3') or '']
    intro_r2_key      = row.get('intro_r2_key')
    cover_bg_r2_key   = row.get('cover_bg_r2_key')
    cover_photo_index = int(row.get('cover_photo_index') or 0)
    narration_override = row.get('narration_text') or None
    photo_count = int(row.get('photo_count') or 30)
    motion_style = row.get('motion_style') or 'stable'

    print(f"[run_video_job] MLS={mls_number} agent={agent_id} photo_count={photo_count} intro_key={intro_r2_key} cover_bg_key={cover_bg_r2_key}")

    import boto3
    from botocore.config import Config
    s3 = boto3.client(
        "s3",
        endpoint_url=os.environ["R2_ENDPOINT"],
        aws_access_key_id=os.environ["S3_KEY"],
        aws_secret_access_key=os.environ["S3_SECRET"],
        region_name="auto",
        config=Config(signature_version="s3v4"),
    )
    bucket = os.environ.get("S3_BUCKET", "tourit")

    # ── Download intro from R2 if present ────────────────────────────────────
    intro_bytes = None
    if intro_r2_key:
        try:
            obj = s3.get_object(Bucket=bucket, Key=intro_r2_key)
            intro_bytes = obj["Body"].read()
            print(f"[run_video_job] Downloaded intro {len(intro_bytes):,} bytes from R2")
        except Exception as e:
            print(f"[run_video_job] Could not download intro (non-fatal): {e}")

    # ── Download cover background from R2 if present ─────────────────────────
    cover_bg_bytes = None
    if cover_bg_r2_key:
        try:
            obj = s3.get_object(Bucket=bucket, Key=cover_bg_r2_key)
            cover_bg_bytes = obj["Body"].read()
            print(f"[run_video_job] Downloaded cover_bg {len(cover_bg_bytes):,} bytes from R2")
        except Exception as e:
            print(f"[run_video_job] Could not download cover_bg (non-fatal): {e}")

    # ── Load Flask app (module-level app, not factory) ───────────────────────
    from app import app

    from app.services.xhs_db_jobs import db_status_callback
    from app.services.xhs_video_service import register_job_callback, _run_pipeline

    register_job_callback(job_id, db_status_callback)

    print(f"[run_video_job] Launching pipeline...")
    _run_pipeline(job_id, mls_number, agent_id, cover_lines, app,
                  intro_bytes=intro_bytes, cover_bg_bytes=cover_bg_bytes,
                  cover_photo_index=cover_photo_index,
                  narration_override=narration_override,
                  photo_count=photo_count,
                  motion_style=motion_style)

    # Check final job status — exit non-zero so GitHub Actions shows red on failure
    from app.services.xhs_db_jobs import get_job as _get_job
    final = _get_job(job_id) or {}
    if final.get('status') == 'error':
        print(f"[run_video_job] Pipeline FAILED: {final.get('message', 'unknown error')}")
        sys.exit(1)
    print(f"[run_video_job] Pipeline finished for job {job_id}")

    # ── Clean up temp files from R2 ───────────────────────────────────────────
    for key in [intro_r2_key, cover_bg_r2_key]:
        if key:
            try:
                s3.delete_object(Bucket=bucket, Key=key)
                print(f"[run_video_job] Cleaned up {key}")
            except Exception:
                pass


if __name__ == "__main__":
    main()
