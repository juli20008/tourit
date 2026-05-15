-- Run this in the Supabase SQL Editor (needs superuser for the extension).
-- These indexes make ILIKE '%term%' search on mls_listings fast via pg_trgm.

-- 1. Enable trigram extension (one-time, idempotent)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. GIN trigram indexes — each one makes ILIKE '%term%' use the index
--    instead of a full sequential scan on 200k+ rows.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mls_city_trgm
    ON mls_listings USING GIN (city gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mls_neighborhood_trgm
    ON mls_listings USING GIN (neighborhood gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mls_street_name_trgm
    ON mls_listings USING GIN (street_name gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mls_mls_number_trgm
    ON mls_listings USING GIN (mls_number gin_trgm_ops);

-- 3. B-tree index on state — used for the Ontario-only suggest filter
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mls_state
    ON mls_listings (state)
    WHERE state IS NOT NULL;
