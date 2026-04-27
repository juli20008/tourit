"""add agent availability

Revision ID: 9c5e0b1e7a21
Revises: 1c68367c9f2e
Create Date: 2026-04-15 00:00:01.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '9c5e0b1e7a21'
down_revision = '1c68367c9f2e'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'agent_availabilities',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('agent_id', sa.Integer(), nullable=False),
        sa.Column('weekday', sa.Integer(), nullable=False),
        sa.Column('start_time', sa.String(length=5), nullable=False),
        sa.Column('end_time', sa.String(length=5), nullable=False),
        sa.ForeignKeyConstraint(['agent_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade():
    op.drop_table('agent_availabilities')
