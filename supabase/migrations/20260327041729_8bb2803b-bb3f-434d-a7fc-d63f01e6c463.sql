ALTER TABLE public.ktrenz_trend_tracking
ALTER COLUMN interest_score TYPE numeric(10,2)
USING interest_score::numeric(10,2);