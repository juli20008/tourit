"""add index on agent slug for whitelabel lookup

Revision ID: 20260514_000001
Revises: 20260501_000002_add_property_detail_fields
Create Date: 2026-05-14
"""
from alembic import op

revision = '20260514_000001'
down_revision = '20260501_000002'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_user_agent_slug
        ON users (lower(regexp_replace(username, '[^a-zA-Z0-9]', '', 'g')))
        WHERE agent = true
    """)


def downgrade():
    op.execute('DROP INDEX IF EXISTS ix_user_agent_slug')
