
CREATE TABLE public.ktrenz_b2_prescores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  star_id UUID NOT NULL,
  news_count INTEGER NOT NULL DEFAULT 0,
  pre_score INTEGER NOT NULL DEFAULT 0,
  batch_id TEXT NOT NULL,
  scored_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_b2_prescores_star ON public.ktrenz_b2_prescores (star_id);
CREATE INDEX idx_b2_prescores_batch ON public.ktrenz_b2_prescores (batch_id);
CREATE INDEX idx_b2_prescores_scored_at ON public.ktrenz_b2_prescores (scored_at DESC);

ALTER TABLE public.ktrenz_b2_prescores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read prescores"
ON public.ktrenz_b2_prescores FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Service role can insert prescores"
ON public.ktrenz_b2_prescores FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Service role can delete prescores"
ON public.ktrenz_b2_prescores FOR DELETE
TO service_role
USING (true);
