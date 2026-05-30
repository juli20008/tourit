"""add voice fields to users

Revision ID: 20260530_000001
Revises: 20260526_000003
Create Date: 2026-05-30 00:00:01.000000

Apply in Supabase SQL Editor:
  ALTER TABLE users ADD COLUMN IF NOT EXISTS voice_sample_url VARCHAR(500);
  ALTER TABLE users ADD COLUMN IF NOT EXISTS elevenlabs_voice_id VARCHAR(100);
"""
from alembic import op
import sqlalchemy as sa

revision = '20260530_000001'
down_revision = '20260526_000003'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('voice_sample_url', sa.String(500), nullable=True))
    op.add_column('users', sa.Column('elevenlabs_voice_id', sa.String(100), nullable=True))


def downgrade():
    op.drop_column('users', 'elevenlabs_voice_id')
    op.drop_column('users', 'voice_sample_url')
