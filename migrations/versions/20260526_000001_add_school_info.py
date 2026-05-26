"""add_school_info

Revision ID: 20260526_000001
Revises: 20260514_000001
Create Date: 2026-05-26 00:00:01.000000

Schema changes applied directly in Supabase SQL Editor:
  ALTER TABLE mls_listings ADD COLUMN IF NOT EXISTS school_info JSONB;
upgrade() is a no-op so Render does not attempt to re-apply already-executed DDL.
"""
from alembic import op

revision = '20260526_000001'
down_revision = '20260514_000001'
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
