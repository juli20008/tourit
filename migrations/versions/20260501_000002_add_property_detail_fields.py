"""add_property_detail_fields

Revision ID: 20260501_000002
Revises: 20260501_000001
Create Date: 2026-05-01 00:00:02.000000

Schema changes applied directly in Supabase SQL Editor:
  ALTER TABLE mls_listings ADD COLUMN IF NOT EXISTS lot_frontage VARCHAR(50);
  ALTER TABLE mls_listings ADD COLUMN IF NOT EXISTS lot_size_area NUMERIC(12,2);
  ALTER TABLE mls_listings ADD COLUMN IF NOT EXISTS construction_materials TEXT;
  ALTER TABLE mls_listings ADD COLUMN IF NOT EXISTS levels VARCHAR(20);
  ALTER TABLE mls_listings ADD COLUMN IF NOT EXISTS ownership_type VARCHAR(50);
upgrade() is a no-op so Render does not attempt to re-apply already-executed DDL.
"""
from alembic import op

revision = '20260501_000002'
down_revision = '20260501_000001'
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
