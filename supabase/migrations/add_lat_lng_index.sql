-- Speeds up map bounds queries (the most frequent query on the site).
-- CONCURRENTLY means no table lock while building.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mls_listings_lat_lng
ON mls_listings(lat, lng)
WHERE lat IS NOT NULL AND lng IS NOT NULL;
