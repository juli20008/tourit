"""add external_id, photos_timestamp, photos_count to mls_listings

Revision ID: 20260430_000001
Revises: e729c233372c
Create Date: 2026-04-30 00:00:01.000000

Uses IF NOT EXISTS so this migration is safe to run against a database
that already has these columns (e.g. when columns were added directly
via Supabase before the migration was written).
"""
from alembic import op


revision = '20260430_000001'
down_revision = 'e729c233372c'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        ALTER TABLE mls_listings
            ADD COLUMN IF NOT EXISTS external_id    VARCHAR(50),
            ADD COLUMN IF NOT EXISTS photos_timestamp VARCHAR(30),
            ADD COLUMN IF NOT EXISTS photos_count   INTEGER
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_mls_listings_external_id
        ON mls_listings (external_id)
    """)


def downgrade():
    op.execute("DROP INDEX IF EXISTS idx_mls_listings_external_id")
    op.execute("ALTER TABLE mls_listings DROP COLUMN IF EXISTS photos_count")
    op.execute("ALTER TABLE mls_listings DROP COLUMN IF EXISTS photos_timestamp")
    op.execute("ALTER TABLE mls_listings DROP COLUMN IF EXISTS external_id")
