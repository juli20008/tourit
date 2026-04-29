-- Run this in Supabase SQL Editor if the coordinate index is missing.
-- It matches the local Flask/Alembic migration and speeds up bbox filtering.
create index if not exists idx_mls_listings_lat_lng
  on public.mls_listings (lat, lng);
