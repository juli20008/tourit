"""add external_id, photos_timestamp, photos_count to mls_listings

Revision ID: 20260430_000001
Revises: e729c233372c
Create Date: 2026-04-30 00:00:01.000000

"""
from alembic import op
import sqlalchemy as sa


revision = '20260430_000001'
down_revision = 'e729c233372c'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('mls_listings', sa.Column('external_id', sa.String(length=50), nullable=True))
    op.add_column('mls_listings', sa.Column('photos_timestamp', sa.String(length=30), nullable=True))
    op.add_column('mls_listings', sa.Column('photos_count', sa.Integer(), nullable=True))
    op.create_index('idx_mls_listings_external_id', 'mls_listings', ['external_id'])


def downgrade():
    op.drop_index('idx_mls_listings_external_id', table_name='mls_listings')
    op.drop_column('mls_listings', 'photos_count')
    op.drop_column('mls_listings', 'photos_timestamp')
    op.drop_column('mls_listings', 'external_id')
