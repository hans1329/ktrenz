
CREATE TABLE IF NOT EXISTS public.ktrenz_trend_ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id UUID NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  agency_insight TEXT NOT NULL,
  ai_insight TEXT NOT NULL,
  model_used TEXT,
  generated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(trigger_id, language)
);

ALTER TABLE public.ktrenz_trend_ai_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read trend AI insights"
  ON public.ktrenz_trend_ai_insights
  FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Authenticated users can insert trend AI insights"
  ON public.ktrenz_trend_ai_insights
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
