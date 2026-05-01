"""add_property_detail_fields

Revision ID: 20260501_000002
Revises: 20260501_000001
Create Date: 2026-05-01 00:00:02.000000

"""
from alembic import op
import sqlalchemy as sa

revision = '20260501_000002'
down_revision = '20260501_000001'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('mls_listings', sa.Column('lot_frontage', sa.String(50), nullable=True))
    op.add_column('mls_listings', sa.Column('lot_size_area', sa.Numeric(12, 2), nullable=True))
    op.add_column('mls_listings', sa.Column('construction_materials', sa.Text, nullable=True))
    op.add_column('mls_listings', sa.Column('levels', sa.String(20), nullable=True))
    op.add_column('mls_listings', sa.Column('ownership_type', sa.String(50), nullable=True))


def downgrade():
    op.drop_column('mls_listings', 'ownership_type')
    op.drop_column('mls_listings', 'levels')
    op.drop_column('mls_listings', 'construction_materials')
    op.drop_column('mls_listings', 'lot_size_area')
    op.drop_column('mls_listings', 'lot_frontage')
