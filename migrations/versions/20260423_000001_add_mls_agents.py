"""add mls_agents table with indexes

Revision ID: a3f7c2d91b40
Revises: 9c5e0b1e7a21
Create Date: 2026-04-23 00:00:01.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'a3f7c2d91b40'
down_revision = '9c5e0b1e7a21'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'mls_agents',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('repliers_id', sa.String(length=50), nullable=False),
        sa.Column('first_name', sa.String(length=100), nullable=True),
        sa.Column('last_name', sa.String(length=100), nullable=True),
        sa.Column('full_name', sa.String(length=200), nullable=True),
        sa.Column('license_id', sa.String(length=50), nullable=True),
        sa.Column('email', sa.String(length=255), nullable=True),
        sa.Column('phone', sa.String(length=50), nullable=True),
        sa.Column('city', sa.String(length=100), nullable=True),
        sa.Column('province', sa.String(length=10), nullable=True),
        sa.Column('office', sa.String(length=200), nullable=True),
        sa.Column('position', sa.String(length=100), nullable=True),
        sa.Column('photo_url', sa.String(length=500), nullable=True),
        sa.Column('lat', sa.Numeric(precision=10, scale=7), nullable=True),
        sa.Column('lng', sa.Numeric(precision=10, scale=7), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False,
                  server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False,
                  server_default=sa.text('NOW()')),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('repliers_id', name='uq_mls_agents_repliers_id'),
    )
    op.create_index('idx_mls_agents_full_name', 'mls_agents', ['full_name'])
    op.create_index('idx_mls_agents_license_id', 'mls_agents', ['license_id'])
    op.create_index('idx_mls_agents_city', 'mls_agents', ['city'])
    # Composite index for common geo-bounding-box queries
    op.create_index('idx_mls_agents_lat_lng', 'mls_agents', ['lat', 'lng'])


def downgrade():
    op.drop_index('idx_mls_agents_lat_lng', table_name='mls_agents')
    op.drop_index('idx_mls_agents_city', table_name='mls_agents')
    op.drop_index('idx_mls_agents_license_id', table_name='mls_agents')
    op.drop_index('idx_mls_agents_full_name', table_name='mls_agents')
    op.drop_table('mls_agents')
