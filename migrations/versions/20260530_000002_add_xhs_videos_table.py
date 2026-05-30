"""add xhs_videos table

Revision ID: 20260530_000002
Revises: 20260530_000001
Create Date: 2026-05-30 00:00:02.000000

Apply in Supabase SQL Editor:
  CREATE TABLE IF NOT EXISTS xhs_videos (
      id            SERIAL PRIMARY KEY,
      agent_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mls_number    VARCHAR(50) NOT NULL,
      video_url     VARCHAR(500) NOT NULL,
      storage_path  VARCHAR(200) NOT NULL,
      cover1        VARCHAR(40),
      cover2        VARCHAR(40),
      cover3        VARCHAR(40),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at    TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days')
  );
  CREATE INDEX IF NOT EXISTS ix_xhs_videos_agent_id ON xhs_videos (agent_id);
  CREATE INDEX IF NOT EXISTS ix_xhs_videos_expires_at ON xhs_videos (expires_at);
"""
from alembic import op
import sqlalchemy as sa

revision = '20260530_000002'
down_revision = '20260530_000001'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'xhs_videos',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('agent_id', sa.Integer, sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('mls_number', sa.String(50), nullable=False),
        sa.Column('video_url', sa.String(500), nullable=False),
        sa.Column('storage_path', sa.String(200), nullable=False),
        sa.Column('cover1', sa.String(40)),
        sa.Column('cover2', sa.String(40)),
        sa.Column('cover3', sa.String(40)),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('expires_at', sa.TIMESTAMP(timezone=True), nullable=False),
    )
    op.create_index('ix_xhs_videos_agent_id', 'xhs_videos', ['agent_id'])
    op.create_index('ix_xhs_videos_expires_at', 'xhs_videos', ['expires_at'])


def downgrade():
    op.drop_table('xhs_videos')
