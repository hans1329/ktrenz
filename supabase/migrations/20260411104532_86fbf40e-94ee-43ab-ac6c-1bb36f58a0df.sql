ALTER TABLE public.b2_predictions
  ADD COLUMN IF NOT EXISTS picked_growth integer,
  ADD COLUMN IF NOT EXISTS opponent_growth integer,
  ADD COLUMN IF NOT EXISTS seen_at timestamptz;