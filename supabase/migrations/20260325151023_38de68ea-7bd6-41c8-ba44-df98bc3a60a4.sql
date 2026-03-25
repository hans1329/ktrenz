
ALTER TABLE public.ktrenz_trend_triggers 
  ADD COLUMN IF NOT EXISTS trend_score numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trend_score_details jsonb DEFAULT NULL;

ALTER TABLE public.ktrenz_trend_artist_grades
  ADD COLUMN IF NOT EXISTS influence_score numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS score_details jsonb DEFAULT NULL;
