"""widen properties.zip to varchar(10) for Canadian postal codes

Revision ID: c2f5e8a31d94
Revises: b1e4d9f20c83
Create Date: 2026-04-23 00:00:03.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'c2f5e8a31d94'
down_revision = 'b1e4d9f20c83'
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column('properties', 'zip',
                    existing_type=sa.String(length=5),
                    type_=sa.String(length=10),
                    existing_nullable=False)


def downgrade():
    op.alter_column('properties', 'zip',
                    existing_type=sa.String(length=10),
                    type_=sa.String(length=5),
                    existing_nullable=False)
