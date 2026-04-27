"""add mls_listings table

Revision ID: d4a1b7c83e50
Revises: c2f5e8a31d94
Create Date: 2026-04-23 00:00:04.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision = 'd4a1b7c83e50'
down_revision = 'c2f5e8a31d94'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'mls_listings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('mls_number', sa.String(length=50), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=True),
        sa.Column('standard_status', sa.String(length=30), nullable=True),
        sa.Column('property_class', sa.String(length=50), nullable=True),
        sa.Column('transaction_type', sa.String(length=20), nullable=True),
        sa.Column('list_price', sa.Integer(), nullable=True),
        sa.Column('sold_price', sa.Integer(), nullable=True),
        sa.Column('original_price', sa.Integer(), nullable=True),
        sa.Column('list_date', sa.DateTime(), nullable=True),
        sa.Column('sold_date', sa.DateTime(), nullable=True),
        sa.Column('last_status', sa.String(length=50), nullable=True),
        sa.Column('street_number', sa.String(length=20), nullable=True),
        sa.Column('street_name', sa.String(length=100), nullable=True),
        sa.Column('street_suffix', sa.String(length=30), nullable=True),
        sa.Column('unit_number', sa.String(length=20), nullable=True),
        sa.Column('city', sa.String(length=100), nullable=True),
        sa.Column('state', sa.String(length=10), nullable=True),
        sa.Column('zip', sa.String(length=15), nullable=True),
        sa.Column('country', sa.String(length=10), nullable=True),
        sa.Column('neighborhood', sa.String(length=100), nullable=True),
        sa.Column('lat', sa.Numeric(precision=10, scale=7), nullable=True),
        sa.Column('lng', sa.Numeric(precision=10, scale=7), nullable=True),
        sa.Column('bed', sa.Integer(), nullable=True),
        sa.Column('bath', sa.Integer(), nullable=True),
        sa.Column('sqft', sa.String(length=20), nullable=True),
        sa.Column('year_built', sa.String(length=10), nullable=True),
        sa.Column('style', sa.String(length=100), nullable=True),
        sa.Column('property_type', sa.String(length=50), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('images', JSONB(), nullable=True),
        sa.Column('agent_name', sa.String(length=100), nullable=True),
        sa.Column('agent_email', sa.String(length=255), nullable=True),
        sa.Column('brokerage', sa.String(length=200), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False,
                  server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False,
                  server_default=sa.text('NOW()')),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('mls_number', name='uq_mls_listings_mls_number'),
    )
    op.create_index('idx_mls_listings_city', 'mls_listings', ['city'])
    op.create_index('idx_mls_listings_status', 'mls_listings', ['status'])
    op.create_index('idx_mls_listings_list_price', 'mls_listings', ['list_price'])
    op.create_index('idx_mls_listings_bed', 'mls_listings', ['bed'])
    op.create_index('idx_mls_listings_lat_lng', 'mls_listings', ['lat', 'lng'])


def downgrade():
    op.drop_index('idx_mls_listings_lat_lng', table_name='mls_listings')
    op.drop_index('idx_mls_listings_bed', table_name='mls_listings')
    op.drop_index('idx_mls_listings_list_price', table_name='mls_listings')
    op.drop_index('idx_mls_listings_status', table_name='mls_listings')
    op.drop_index('idx_mls_listings_city', table_name='mls_listings')
    op.drop_table('mls_listings')
