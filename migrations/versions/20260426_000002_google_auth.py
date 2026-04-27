"""add google_id to users, make hashed_password nullable

Revision ID: 20260426_000002
Revises: 20260425_000001
Create Date: 2026-04-26
"""
from alembic import op
import sqlalchemy as sa

revision = '20260426_000002'
down_revision = 'e9f2c4a17b63'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('google_id', sa.String(255), nullable=True))
    op.create_unique_constraint('uq_users_google_id', 'users', ['google_id'])
    op.alter_column('users', 'hashed_password', existing_type=sa.String(255), nullable=True)


def downgrade():
    op.alter_column('users', 'hashed_password', existing_type=sa.String(255), nullable=False)
    op.drop_constraint('uq_users_google_id', 'users', type_='unique')
    op.drop_column('users', 'google_id')
