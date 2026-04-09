
CREATE TABLE public.ktrenz_p2_keywords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword text NOT NULL,
  keyword_ko text,
  keyword_en text,
  discover_source text NOT NULL DEFAULT 'naver_rising',
  discover_date date NOT NULL DEFAULT CURRENT_DATE,
  category text,
  relevance_score real DEFAULT 0,
  matched_star_id uuid REFERENCES public.ktrenz_stars(id) ON DELETE SET NULL,
  raw_context jsonb DEFAULT '{}',
  status text NOT NULL DEFAULT 'active',
  promoted_to_keyword_id uuid,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_p2_keywords_unique 
  ON public.ktrenz_p2_keywords (keyword, discover_source, discover_date);

CREATE INDEX idx_p2_keywords_status ON public.ktrenz_p2_keywords (status);
CREATE INDEX idx_p2_keywords_source ON public.ktrenz_p2_keywords (discover_source);
CREATE INDEX idx_p2_keywords_relevance ON public.ktrenz_p2_keywords (relevance_score DESC);

ALTER TABLE public.ktrenz_p2_keywords ENABLE ROW LEVEL SECURITY;

CREATE POLICY "P2 keywords are viewable by everyone"
  ON public.ktrenz_p2_keywords FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage P2 keywords"
  ON public.ktrenz_p2_keywords FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
