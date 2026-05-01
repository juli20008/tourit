"""add_association_fee

Revision ID: 20260501_000001
Revises: 20260430_000003
Create Date: 2026-05-01 00:00:01.000000

"""
from alembic import op
import sqlalchemy as sa

revision = '20260501_000001'
down_revision = '20260430_000003'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('mls_listings', sa.Column('association_fee', sa.Numeric(10, 2), nullable=True))
    op.add_column('mls_listings', sa.Column('association_fee_frequency', sa.String(30), nullable=True))


def downgrade():
    op.drop_column('mls_listings', 'association_fee_frequency')
    op.drop_column('mls_listings', 'association_fee')
