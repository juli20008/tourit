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

    db_url = os.environ.get("DATABASE_URL") or os.environ.get("NEON_DATABASE_URL")
    conn = psycopg2.connect(db_url)
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT * FROM xhs_video_jobs WHERE job_id = %s", (job_id,))
        row = cur.fetchone()
    conn.close()

    if not row:
        print(f"[run_video_job] Job {job_id} not found in DB")
        sys.exit(1)

    row = dict(row)
    mls_number   = row['mls_number']
    agent_id     = row['agent_id']
    cover_lines  = [row.get('cover1') or '', row.get('cover2') or '', row.get('cover3') or '']
    intro_r2_key = row.get('intro_r2_key')

    print(f"[run_video_job] MLS={mls_number} agent={agent_id} intro_key={intro_r2_key}")

    # ── Download intro from R2 if present ────────────────────────────────────
    intro_bytes = None
    if intro_r2_key:
        try:
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
            obj = s3.get_object(Bucket=os.environ.get("S3_BUCKET", "tourit"), Key=intro_r2_key)
            intro_bytes = obj["Body"].read()
            print(f"[run_video_job] Downloaded intro {len(intro_bytes):,} bytes from R2")
        except Exception as e:
            print(f"[run_video_job] Could not download intro (non-fatal): {e}")
            intro_bytes = None

    # ── Load Flask app (module-level app, not factory) ───────────────────────
    from app import app

    from app.services.xhs_db_jobs import db_status_callback
    from app.services.xhs_video_service import register_job_callback, _run_pipeline

    register_job_callback(job_id, db_status_callback)

    print(f"[run_video_job] Launching pipeline...")
    _run_pipeline(job_id, mls_number, agent_id, cover_lines, app, intro_bytes=intro_bytes)
    print(f"[run_video_job] Pipeline finished for job {job_id}")

    # ── Clean up temp intro from R2 ───────────────────────────────────────────
    if intro_r2_key:
        try:
            s3.delete_object(Bucket=os.environ.get("S3_BUCKET", "tourit"), Key=intro_r2_key)
            print(f"[run_video_job] Cleaned up temp intro {intro_r2_key}")
        except Exception:
            pass


if __name__ == "__main__":
    main()
