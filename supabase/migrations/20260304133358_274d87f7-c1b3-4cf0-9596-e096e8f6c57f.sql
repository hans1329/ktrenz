
-- Add fan activity columns to v3_energy_snapshots_v2
ALTER TABLE v3_energy_snapshots_v2
  ADD COLUMN IF NOT EXISTS fan_score numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fan_velocity integer,
  ADD COLUMN IF NOT EXISTS fan_intensity integer;

-- Add fan activity columns to v3_scores_v2
ALTER TABLE v3_scores_v2
  ADD COLUMN IF NOT EXISTS fan_score numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fan_change_24h numeric;
