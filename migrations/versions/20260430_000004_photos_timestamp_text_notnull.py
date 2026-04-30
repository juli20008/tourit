"""Guard photos_timestamp against FLOAT/REAL types; ensure TEXT

Revision ID: 20260430_000004
Revises: 20260430_000003
Create Date: 2026-04-30 00:00:04.000000

If photos_timestamp was ever stored as DOUBLE PRECISION or REAL, an 18-digit
.NET tick value would lose ~3 significant digits (float64 has ~15.9 sig figs),
producing timestamps that end in spurious zeros and generate broken CDN URLs.

This migration casts any remaining numeric column back to TEXT.  If the column
is already TEXT (the expected state after migration 000003) the ALTER is a no-op.
"""
from alembic import op


revision = '20260430_000004'
down_revision = '20260430_000003'
branch_labels = None
depends_on = None


def upgrade():
    # USING clause re-serialises whatever is in the column as text.
    # For a TEXT column this is already a no-op in PostgreSQL.
    op.execute("""
        ALTER TABLE mls_listings
            ALTER COLUMN photos_timestamp TYPE TEXT USING photos_timestamp::TEXT
    """)


def downgrade():
    pass  # TEXT → TEXT: nothing to revert
