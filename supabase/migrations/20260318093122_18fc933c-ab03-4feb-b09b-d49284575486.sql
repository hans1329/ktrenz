ALTER TABLE ktrenz_trend_triggers
  ADD COLUMN IF NOT EXISTS expired_at timestamptz,
  ADD COLUMN IF NOT EXISTS lifetime_hours numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peak_delay_hours numeric DEFAULT 0;