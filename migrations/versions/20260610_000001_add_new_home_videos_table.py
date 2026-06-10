"""add new_home_videos table

Revision ID: 20260610_000001
Revises: 20260609_000001
Create Date: 2026-06-10
"""
from alembic import op
import sqlalchemy as sa

revision = '20260610_000001'
down_revision = '20260609_000001'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE IF NOT EXISTS new_home_videos (
            id           SERIAL PRIMARY KEY,
            agent_id     INTEGER NOT NULL,
            video_url    TEXT,
            cover_url    TEXT,
            storage_path TEXT,
            cover1       TEXT,
            cover2       TEXT,
            cover3       TEXT,
            created_at   TIMESTAMPTZ DEFAULT NOW(),
            expires_at   TEXT
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_new_home_videos_agent_id ON new_home_videos (agent_id)")


def downgrade():
    op.execute("DROP TABLE IF EXISTS new_home_videos")
