"""widen agent_areas.zip from 5 to 7 chars for Canadian postal codes

Revision ID: 20260426_000003
Revises: 20260426_000002
Create Date: 2026-04-26
"""
from alembic import op
import sqlalchemy as sa

revision = '20260426_000003'
down_revision = '20260426_000002'
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column(
        'agent_areas', 'zip',
        existing_type=sa.String(5),
        type_=sa.String(7),
        existing_nullable=False,
    )


def downgrade():
    op.alter_column(
        'agent_areas', 'zip',
        existing_type=sa.String(7),
        type_=sa.String(5),
        existing_nullable=False,
    )
