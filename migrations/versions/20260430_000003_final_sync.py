"""final_sync

Revision ID: 20260430_000003
Revises: e729c233372c
Create Date: 2026-04-30 00:00:03.000000

Schema changes (external_id, photos_timestamp, photos_count columns) were
applied directly in Supabase before this migration ran.  alembic_version
was set to this revision manually.  upgrade() is intentionally a no-op so
Render does not attempt to re-apply already-executed DDL.
"""
from alembic import op


revision = '20260430_000003'
down_revision = 'e729c233372c'
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
