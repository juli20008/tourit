"""
Neon DB helpers for 新房视频 job state.
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
                CREATE TABLE IF NOT EXISTS new_home_video_jobs (
                    job_id           TEXT PRIMARY KEY,
                    status           TEXT    DEFAULT 'queued',
                    step             TEXT,
                    agent_id         INTEGER,
                    main_r2_key      TEXT,
                    narration        TEXT,
                    cover1           TEXT,
                    cover2           TEXT,
                    cover3           TEXT,
                    intro_r2_key     TEXT,
                    cover_bg_r2_key  TEXT,
                    video_url        TEXT,
                    cover_url        TEXT,
                    expires_at       TEXT,
                    error_msg        TEXT,
                    created_at       TIMESTAMPTZ DEFAULT NOW(),
                    updated_at       TIMESTAMPTZ DEFAULT NOW()
                )
            """)
            cur.execute("""
                ALTER TABLE new_home_video_jobs
                ADD COLUMN IF NOT EXISTS cover_bg_r2_key TEXT
            """)
    finally:
        conn.close()


def create_job(job_id, agent_id, main_r2_key, narration, cover_lines, intro_r2_key=None, cover_bg_r2_key=None):
    conn = _conn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("""
                INSERT INTO new_home_video_jobs
                    (job_id, status, agent_id, main_r2_key, narration,
                     cover1, cover2, cover3, intro_r2_key, cover_bg_r2_key)
                VALUES (%s, 'queued', %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (job_id) DO NOTHING
            """, (
                job_id, agent_id, main_r2_key, narration,
                cover_lines[0] if len(cover_lines) > 0 else '',
                cover_lines[1] if len(cover_lines) > 1 else '',
                cover_lines[2] if len(cover_lines) > 2 else '',
                intro_r2_key,
                cover_bg_r2_key,
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
                f"UPDATE new_home_video_jobs SET {', '.join(fields)} WHERE job_id = %s",
                values,
            )
    finally:
        conn.close()


def db_status_callback(job_id, data):
    mapped = {'status': data.get('status')}
    if data.get('step'):      mapped['step']      = data['step']
    if data.get('url'):       mapped['video_url'] = data['url']
    if data.get('cover_url'): mapped['cover_url'] = data['cover_url']
    if data.get('expires_at'):mapped['expires_at']= data['expires_at']
    if data.get('message'):   mapped['error_msg'] = data['message']
    update_job(job_id, mapped)


def get_job(job_id):
    conn = _conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT * FROM new_home_video_jobs WHERE job_id = %s", (job_id,))
            row = cur.fetchone()
    finally:
        conn.close()
    if not row:
        return None
    d = dict(row)
    result = {'status': d.get('status', 'queued')}
    if d.get('step'):       result['step']       = d['step']
    if d.get('video_url'):  result['url']        = d['video_url']
    if d.get('cover_url'):  result['cover_url']  = d['cover_url']
    if d.get('expires_at'): result['expires_at'] = str(d['expires_at'])
    if d.get('error_msg'):  result['message']    = d['error_msg']
    return result
