"""add ppt_videos table

Revision ID: 20260609_000001
Revises: 20260604_000001
Create Date: 2026-06-09

Apply manually:
  CREATE TABLE IF NOT EXISTS ppt_videos (
      id           SERIAL PRIMARY KEY,
      agent_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      video_url    VARCHAR(500) NOT NULL,
      cover_url    VARCHAR(500),
      storage_path VARCHAR(200) NOT NULL,
      cover1       VARCHAR(40),
      cover2       VARCHAR(40),
      cover3       VARCHAR(40),
      slide_count  INTEGER,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at   TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days')
  );
  CREATE INDEX IF NOT EXISTS ix_ppt_videos_agent_id  ON ppt_videos (agent_id);
  CREATE INDEX IF NOT EXISTS ix_ppt_videos_expires_at ON ppt_videos (expires_at);
"""
from alembic import op
import sqlalchemy as sa

revision = '20260609_000001'
down_revision = '20260604_000001'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'ppt_videos',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('agent_id', sa.Integer, sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('video_url', sa.String(500), nullable=False),
        sa.Column('cover_url', sa.String(500)),
        sa.Column('storage_path', sa.String(200), nullable=False),
        sa.Column('cover1', sa.String(40)),
        sa.Column('cover2', sa.String(40)),
        sa.Column('cover3', sa.String(40)),
        sa.Column('slide_count', sa.Integer),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('expires_at', sa.TIMESTAMP(timezone=True), nullable=False),
    )
    op.create_index('ix_ppt_videos_agent_id',   'ppt_videos', ['agent_id'])
    op.create_index('ix_ppt_videos_expires_at', 'ppt_videos', ['expires_at'])


def downgrade():
    op.drop_table('ppt_videos')
