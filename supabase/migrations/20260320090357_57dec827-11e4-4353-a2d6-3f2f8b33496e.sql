-- Add keyword_en column to store English translation when keyword is in Korean
ALTER TABLE public.ktrenz_trend_triggers
ADD COLUMN IF NOT EXISTS keyword_en text;

-- Add index for cross-source dedup matching
CREATE INDEX IF NOT EXISTS idx_ktrenz_trend_triggers_keyword_en
ON public.ktrenz_trend_triggers (keyword_en)
WHERE keyword_en IS NOT NULL;