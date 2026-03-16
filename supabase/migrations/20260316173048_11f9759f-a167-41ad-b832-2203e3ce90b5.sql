
-- Add melon_artist_name column for exact Melon chart matching
ALTER TABLE v3_artist_tiers ADD COLUMN IF NOT EXISTS melon_artist_name text;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_v3_artist_tiers_melon_name ON v3_artist_tiers (melon_artist_name) WHERE melon_artist_name IS NOT NULL;
