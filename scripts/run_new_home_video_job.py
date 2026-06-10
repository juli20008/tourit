"""
CLI entry point for GitHub Actions 新房视频 generation.
Usage: python scripts/run_new_home_video_job.py <job_id>
"""
import os
import sys

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


def _s3_client():
    import boto3
    from botocore.config import Config
    return boto3.client(
        "s3",
        endpoint_url=os.environ["R2_ENDPOINT"],
        aws_access_key_id=os.environ["S3_KEY"],
        aws_secret_access_key=os.environ["S3_SECRET"],
        region_name="auto",
        config=Config(signature_version="s3v4"),
    )


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/run_new_home_video_job.py <job_id>")
        sys.exit(1)

    job_id = sys.argv[1].strip()
    print(f"[run_new_home_video_job] Starting job {job_id}")

    import psycopg2
    import psycopg2.extras

    db_url = os.environ.get("DATABASE_URL") or os.environ.get("NEON_DATABASE_URL")
    conn = psycopg2.connect(db_url)
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT * FROM new_home_video_jobs WHERE job_id = %s", (job_id,))
        row = cur.fetchone()
    conn.close()

    if not row:
        print(f"[run_new_home_video_job] Job {job_id} not found")
        sys.exit(1)

    row = dict(row)
    agent_id     = row['agent_id']
    main_r2_key  = row['main_r2_key']
    narration    = row.get('narration') or ''
    cover_lines  = [row.get('cover1') or '', row.get('cover2') or '', row.get('cover3') or '']
    intro_r2_key = row.get('intro_r2_key')

    print(f"[run_new_home_video_job] agent={agent_id} main={main_r2_key}")

    s3 = _s3_client()
    bucket = os.environ.get("S3_BUCKET", "tourit")

    # Download main video
    obj = s3.get_object(Bucket=bucket, Key=main_r2_key)
    main_video_bytes = obj["Body"].read()
    print(f"[run_new_home_video_job] Downloaded main video {len(main_video_bytes):,} bytes")

    # Download intro if present
    intro_bytes = None
    if intro_r2_key:
        try:
            obj = s3.get_object(Bucket=bucket, Key=intro_r2_key)
            intro_bytes = obj["Body"].read()
            print(f"[run_new_home_video_job] Downloaded intro {len(intro_bytes):,} bytes")
        except Exception as e:
            print(f"[run_new_home_video_job] Intro download failed (non-fatal): {e}")

    from app import app
    from app.services.new_home_db_jobs import db_status_callback
    from app.services.new_home_video_service import register_job_callback, _run_new_home_pipeline

    register_job_callback(job_id, db_status_callback)

    print(f"[run_new_home_video_job] Launching pipeline...")
    _run_new_home_pipeline(
        job_id, agent_id, main_video_bytes, narration, cover_lines, app,
        intro_bytes=intro_bytes,
    )
    print(f"[run_new_home_video_job] Done")

    # Cleanup R2 temp files
    for key in [main_r2_key, intro_r2_key]:
        if key:
            try:
                s3.delete_object(Bucket=bucket, Key=key)
                print(f"[run_new_home_video_job] Cleaned up {key}")
            except Exception:
                pass


if __name__ == "__main__":
    main()
