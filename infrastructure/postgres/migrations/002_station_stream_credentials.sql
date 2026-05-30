-- Migration: station streaming credentials
-- Safe to run multiple times (idempotent)

ALTER TABLE stations ADD COLUMN IF NOT EXISTS source_password VARCHAR(255);

-- Generate passwords for existing stations without one
UPDATE stations
SET source_password = encode(gen_random_bytes(16), 'base64')
WHERE source_password IS NULL OR source_password = '';
