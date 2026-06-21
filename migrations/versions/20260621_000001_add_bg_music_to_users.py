"""add bg_music_url to users

Revision ID: 20260621_000001
Revises: 20260610_000001
Create Date: 2026-06-21 00:00:01.000000

Apply in Neon SQL Editor:
  ALTER TABLE users ADD COLUMN IF NOT EXISTS bg_music_url VARCHAR(500);
"""
from alembic import op
import sqlalchemy as sa

revision = '20260621_000001'
down_revision = '20260610_000001'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('bg_music_url', sa.String(500), nullable=True))


def downgrade():
    op.drop_column('users', 'bg_music_url')
