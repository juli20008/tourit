"""Ensure photos_timestamp is TEXT and external_id is VARCHAR(100)

Revision ID: 20260430_000003
Revises: 20260430_000001
Create Date: 2026-04-30 00:00:03.000000

photos_timestamp was added as VARCHAR(30) in migration 000001, but the live
Supabase DB already has it as TEXT (added manually before migration ran).
TEXT is strictly better — no length constraint — so we normalise here.

external_id was added as VARCHAR(50), but the live DB has VARCHAR(100).
Widening the constraint aligns code and DB.

Both ALTER COLUMNs are safe no-ops if the column is already the target type.
"""
from alembic import op


revision = '20260430_000003'
down_revision = '20260430_000001'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        ALTER TABLE mls_listings
            ALTER COLUMN photos_timestamp TYPE TEXT,
            ALTER COLUMN external_id     TYPE VARCHAR(100)
    """)


def downgrade():
    op.execute("""
        ALTER TABLE mls_listings
            ALTER COLUMN photos_timestamp TYPE VARCHAR(30),
            ALTER COLUMN external_id     TYPE VARCHAR(50)
    """)
