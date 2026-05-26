"""composite partial index on (lat, lng) for active listings + updated_at index

Revision ID: 20260526_000003
Revises: 20260526_000002
Create Date: 2026-05-26
"""
from alembic import op

revision = '20260526_000003'
down_revision = '20260526_000002'
branch_labels = None
depends_on = None

_INACTIVE = "('Inactive','Sold','Expired','Cancelled','Withdrawn')"


def upgrade():
    # Composite index for bounding-box queries — covers both dimensions in one scan.
    # Partial: only indexes active listings, keeping it small.
    op.execute(f"""
        CREATE INDEX IF NOT EXISTS ix_mls_listings_lat_lng_active
        ON mls_listings (lat, lng)
        WHERE standard_status NOT IN {_INACTIVE}
          AND lat IS NOT NULL
          AND lng IS NOT NULL
    """)
    # Covers ORDER BY updated_at DESC in list view
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_mls_listings_updated_at
        ON mls_listings (updated_at DESC NULLS LAST)
    """)


def downgrade():
    op.execute('DROP INDEX IF EXISTS ix_mls_listings_lat_lng_active')
    op.execute('DROP INDEX IF EXISTS ix_mls_listings_updated_at')
