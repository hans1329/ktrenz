CREATE TABLE public.ktrenz_b2_insights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL,
  star_id UUID NOT NULL,
  insight_text TEXT NOT NULL,
  insight_data JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_b2_insights_run_star ON public.ktrenz_b2_insights (run_id, star_id);

ALTER TABLE public.ktrenz_b2_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read battle insights"
  ON public.ktrenz_b2_insights FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Service role can insert battle insights"
  ON public.ktrenz_b2_insights FOR INSERT
  TO service_role
  WITH CHECK (true);