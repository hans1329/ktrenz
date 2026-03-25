ALTER TABLE public.ktrenz_schedule_predictions
  ADD COLUMN IF NOT EXISTS source_articles jsonb DEFAULT '[]'::jsonb;