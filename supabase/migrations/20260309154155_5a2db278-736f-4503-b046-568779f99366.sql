-- Add social_velocity and social_intensity columns to v3_energy_snapshots_v2
ALTER TABLE v3_energy_snapshots_v2 
  ADD COLUMN IF NOT EXISTS social_score numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS social_velocity numeric,
  ADD COLUMN IF NOT EXISTS social_intensity numeric;

-- Add social_score and social_change_24h to v3_scores_v2
ALTER TABLE v3_scores_v2
  ADD COLUMN IF NOT EXISTS social_score numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS social_change_24h numeric;