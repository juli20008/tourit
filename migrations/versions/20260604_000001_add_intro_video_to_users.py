"""add intro_video_url to users

Revision ID: 20260604_000001
Revises: 20260530_000002
Create Date: 2026-06-04 00:00:01.000000

Apply in Supabase SQL Editor:
  ALTER TABLE users ADD COLUMN IF NOT EXISTS intro_video_url VARCHAR(500);
"""
from alembic import op
import sqlalchemy as sa

revision = '20260604_000001'
down_revision = '20260530_000002'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('intro_video_url', sa.String(500), nullable=True))


def downgrade():
    op.drop_column('users', 'intro_video_url')
