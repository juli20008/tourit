-- Run this in your Supabase SQL editor
-- Creates the guest_bookings table for anonymous visitor lead capture

CREATE TABLE IF NOT EXISTS guest_bookings (
    id               SERIAL PRIMARY KEY,
    guest_id         VARCHAR(64) NOT NULL UNIQUE,
    property_address VARCHAR(255) NOT NULL,
    property_image   VARCHAR(500),
    mls_number       VARCHAR(50),
    mls_listing_id   INTEGER,
    property_id      INTEGER,
    date             VARCHAR(50) NOT NULL,
    time             VARCHAR(50) NOT NULL,
    phone            VARCHAR(50),
    email            VARCHAR(255),
    status           VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_guest_bookings_guest_id ON guest_bookings (guest_id);
