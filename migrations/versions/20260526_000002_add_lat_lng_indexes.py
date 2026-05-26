"""add indexes on lat and lng for map bounds queries

Revision ID: 20260526_000002
Revises: 20260526_000001
Create Date: 2026-05-26
"""
from alembic import op

revision = '20260526_000002'
down_revision = '20260526_000001'
branch_labels = None
depends_on = None


def upgrade():
    op.execute('CREATE INDEX IF NOT EXISTS ix_mls_listings_lat ON mls_listings (lat)')
    op.execute('CREATE INDEX IF NOT EXISTS ix_mls_listings_lng ON mls_listings (lng)')


def downgrade():
    op.execute('DROP INDEX IF EXISTS ix_mls_listings_lat')
    op.execute('DROP INDEX IF EXISTS ix_mls_listings_lng')
