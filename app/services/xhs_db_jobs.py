"""
Neon DB helpers for XHS video job state.
Used by both the Flask API (read/write) and the GitHub Actions script (write).
"""
import os
import psycopg2
import psycopg2.extras


def _conn():
    url = os.environ.get("DATABASE_URL") or os.environ.get("NEON_DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL not set")
    return psycopg2.connect(url)


def ensure_jobs_table():
    conn = _conn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS xhs_video_jobs (
                    job_id       TEXT PRIMARY KEY,
                    status       TEXT    DEFAULT 'queued',
                    step         TEXT,
                    agent_id     INTEGER,
                    mls_number   TEXT,
                    cover1       TEXT,
                    cover2       TEXT,
                    cover3       TEXT,
                    intro_r2_key TEXT,
                    video_url    TEXT,
                    cover_url    TEXT,
                    expires_at   TEXT,
                    error_msg    TEXT,
                    created_at   TIMESTAMPTZ DEFAULT NOW(),
                    updated_at   TIMESTAMPTZ DEFAULT NOW()
                )
            """)
            cur.execute("""
                ALTER TABLE xhs_video_jobs
                ADD COLUMN IF NOT EXISTS cover_url TEXT
            """)
            cur.execute("""
                ALTER TABLE xhs_video_jobs
                ADD COLUMN IF NOT EXISTS cover_bg_r2_key TEXT
            """)
            cur.execute("""
                ALTER TABLE xhs_video_jobs
                ADD COLUMN IF NOT EXISTS cover_photo_index INTEGER DEFAULT 0
            """)
    finally:
        conn.close()


def create_job(job_id, mls_number, agent_id, cover_lines, intro_r2_key=None, cover_bg_r2_key=None, cover_photo_index=0):
    conn = _conn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("""
                INSERT INTO xhs_video_jobs
                    (job_id, status, agent_id, mls_number, cover1, cover2, cover3,
                     intro_r2_key, cover_bg_r2_key, cover_photo_index)
                VALUES (%s, 'queued', %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (job_id) DO NOTHING
            """, (
                job_id, agent_id, mls_number,
                cover_lines[0] if len(cover_lines) > 0 else '',
                cover_lines[1] if len(cover_lines) > 1 else '',
                cover_lines[2] if len(cover_lines) > 2 else '',
                intro_r2_key,
                cover_bg_r2_key,
                cover_photo_index,
            ))
    finally:
        conn.close()


def update_job(job_id, data):
    allowed = {'status', 'step', 'video_url', 'cover_url', 'expires_at', 'error_msg'}
    fields, values = [], []
    for k, v in data.items():
        if k in allowed:
            fields.append(f"{k} = %s")
            values.append(v)
    if not fields:
        return
    fields.append("updated_at = NOW()")
    values.append(job_id)
    conn = _conn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                f"UPDATE xhs_video_jobs SET {', '.join(fields)} WHERE job_id = %s",
                values,
            )
    finally:
        conn.close()


def db_status_callback(job_id, data):
    """Callback compatible with register_job_callback — maps pipeline data to DB columns."""
    mapped = {'status': data.get('status')}
    if data.get('step'):
        mapped['step'] = data['step']
    if data.get('url'):
        mapped['video_url'] = data['url']
    if data.get('cover_url'):
        mapped['cover_url'] = data['cover_url']
    if data.get('expires_at'):
        mapped['expires_at'] = data['expires_at']
    if data.get('message'):
        mapped['error_msg'] = data['message']
    update_job(job_id, mapped)


def get_job(job_id):
    conn = _conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT * FROM xhs_video_jobs WHERE job_id = %s", (job_id,))
            row = cur.fetchone()
    finally:
        conn.close()
    if not row:
        return None
    d = dict(row)
    result = {'status': d.get('status', 'queued')}
    if d.get('step'):
        result['step'] = d['step']
    if d.get('video_url'):
        result['url'] = d['video_url']
    if d.get('cover_url'):
        result['cover_url'] = d['cover_url']
    if d.get('expires_at'):
        result['expires_at'] = str(d['expires_at'])
    if d.get('error_msg'):
        result['message'] = d['error_msg']
    return result
