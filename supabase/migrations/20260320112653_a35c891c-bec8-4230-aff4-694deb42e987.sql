
-- Add intent analysis columns to ktrenz_trend_triggers
ALTER TABLE public.ktrenz_trend_triggers
  ADD COLUMN IF NOT EXISTS commercial_intent text,
  ADD COLUMN IF NOT EXISTS brand_intent text,
  ADD COLUMN IF NOT EXISTS fan_sentiment text,
  ADD COLUMN IF NOT EXISTS trend_potential numeric;

-- Add comments for clarity
COMMENT ON COLUMN public.ktrenz_trend_triggers.commercial_intent IS 'ad|sponsorship|collaboration|organic|rumor';
COMMENT ON COLUMN public.ktrenz_trend_triggers.brand_intent IS 'awareness|conversion|association|loyalty';
COMMENT ON COLUMN public.ktrenz_trend_triggers.fan_sentiment IS 'positive|negative|neutral|mixed';
COMMENT ON COLUMN public.ktrenz_trend_triggers.trend_potential IS '0.0-1.0 score predicting if this keyword will trend';
