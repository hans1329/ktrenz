
-- Discover Keywords: extracted from battle content titles
CREATE TABLE public.ktrenz_discover_keywords (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword TEXT NOT NULL,
  keyword_en TEXT,
  category TEXT NOT NULL DEFAULT 'brand',
  star_ids UUID[] NOT NULL DEFAULT '{}',
  mention_count INTEGER NOT NULL DEFAULT 1,
  batch_id TEXT NOT NULL,
  score_date DATE NOT NULL DEFAULT CURRENT_DATE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent duplicate keyword per date
CREATE UNIQUE INDEX idx_discover_kw_date ON public.ktrenz_discover_keywords (keyword, score_date);

-- Index for date-based queries
CREATE INDEX idx_discover_kw_score_date ON public.ktrenz_discover_keywords (score_date DESC);

-- Enable RLS
ALTER TABLE public.ktrenz_discover_keywords ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Anyone can read discover keywords"
  ON public.ktrenz_discover_keywords FOR SELECT
  USING (true);

-- Service role only for writes (edge functions)
CREATE POLICY "Service role can manage discover keywords"
  ON public.ktrenz_discover_keywords FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
