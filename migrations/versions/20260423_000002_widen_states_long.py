"""widen states.long to varchar(100)

Revision ID: b1e4d9f20c83
Revises: a3f7c2d91b40
Create Date: 2026-04-23 00:00:02.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'b1e4d9f20c83'
down_revision = 'a3f7c2d91b40'
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column('states', 'long',
                    existing_type=sa.String(length=20),
                    type_=sa.String(length=100),
                    existing_nullable=True)


def downgrade():
    op.alter_column('states', 'long',
                    existing_type=sa.String(length=100),
                    type_=sa.String(length=20),
                    existing_nullable=True)
