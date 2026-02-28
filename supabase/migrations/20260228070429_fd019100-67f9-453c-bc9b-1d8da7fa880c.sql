-- Add per-category velocity and intensity columns to snapshots
ALTER TABLE public.v3_energy_snapshots_v2
  ADD COLUMN IF NOT EXISTS youtube_velocity numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS youtube_intensity numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS buzz_velocity numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS buzz_intensity numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS album_velocity numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS album_intensity numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS music_velocity numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS music_intensity numeric DEFAULT 0;

-- Drop old single velocity/intensity columns
ALTER TABLE public.v3_energy_snapshots_v2
  DROP COLUMN IF EXISTS velocity_score,
  DROP COLUMN IF EXISTS intensity_score;