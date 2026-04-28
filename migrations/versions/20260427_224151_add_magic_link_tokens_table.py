"""add magic link tokens table

Revision ID: e729c233372c
Revises: 20260426_000003
Create Date: 2026-04-27 22:41:51.257580

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e729c233372c'
down_revision = '20260426_000003'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'magic_link_tokens',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('token', sa.String(length=64), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('used', sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('magic_link_tokens', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_magic_link_tokens_token'), ['token'], unique=True)


def downgrade():
    with op.batch_alter_table('magic_link_tokens', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_magic_link_tokens_token'))
    op.drop_table('magic_link_tokens')
