-- Add promoted_at column to track when an artist was promoted to Tier 1
ALTER TABLE v3_artist_tiers ADD COLUMN promoted_at timestamptz;

-- Backfill: existing Tier 1 artists get their created_at as promoted_at
UPDATE v3_artist_tiers SET promoted_at = created_at WHERE tier = 1;

-- Create trigger to auto-set promoted_at when tier changes to 1
CREATE OR REPLACE FUNCTION set_promoted_at_on_tier1()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tier = 1 AND (OLD.tier IS DISTINCT FROM 1) THEN
    NEW.promoted_at = now();
  END IF;
  IF NEW.tier != 1 THEN
    NEW.promoted_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_promoted_at
  BEFORE UPDATE ON v3_artist_tiers
  FOR EACH ROW
  EXECUTE FUNCTION set_promoted_at_on_tier1();

-- Also handle INSERT
CREATE OR REPLACE FUNCTION set_promoted_at_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tier = 1 AND NEW.promoted_at IS NULL THEN
    NEW.promoted_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_promoted_at_insert
  BEFORE INSERT ON v3_artist_tiers
  FOR EACH ROW
  EXECUTE FUNCTION set_promoted_at_on_insert();