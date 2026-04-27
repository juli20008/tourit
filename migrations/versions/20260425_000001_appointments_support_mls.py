"""appointments: add mls_listing_id, make property_id nullable

Revision ID: e9f2c4a17b63
Revises: d4a1b7c83e50
Create Date: 2026-04-25 00:00:01.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'e9f2c4a17b63'
down_revision = 'd4a1b7c83e50'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('appointments',
        sa.Column('mls_listing_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_appointments_mls_listing_id',
        'appointments', 'mls_listings',
        ['mls_listing_id'], ['id'],
        ondelete='SET NULL',
    )
    op.alter_column('appointments', 'property_id', nullable=True)


def downgrade():
    op.alter_column('appointments', 'property_id', nullable=False)
    op.drop_constraint('fk_appointments_mls_listing_id', 'appointments', type_='foreignkey')
    op.drop_column('appointments', 'mls_listing_id')
