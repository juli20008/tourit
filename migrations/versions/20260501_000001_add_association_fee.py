"""add_association_fee

Revision ID: 20260501_000001
Revises: 20260430_000003
Create Date: 2026-05-01 00:00:01.000000

Schema changes applied directly in Supabase SQL Editor:
  ALTER TABLE mls_listings ADD COLUMN IF NOT EXISTS association_fee NUMERIC(10,2);
  ALTER TABLE mls_listings ADD COLUMN IF NOT EXISTS association_fee_frequency VARCHAR(30);
upgrade() is a no-op so Render does not attempt to re-apply already-executed DDL.
"""
from alembic import op

revision = '20260501_000001'
down_revision = '20260430_000003'
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
