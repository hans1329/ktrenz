
-- 키워드 단독 테이블: 1 keyword = 1 row (키워드 중심 SSOT)
CREATE TABLE public.ktrenz_keywords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword text NOT NULL,
  keyword_en text,
  keyword_ko text,
  keyword_ja text,
  keyword_zh text,
  keyword_category text,
  status text NOT NULL DEFAULT 'pending',
  baseline_score numeric DEFAULT 0,
  peak_score numeric DEFAULT 0,
  influence_index numeric DEFAULT 0,
  prev_api_total numeric DEFAULT 0,
  peak_at timestamptz,
  detected_at timestamptz NOT NULL DEFAULT now(),
  expired_at timestamptz,
  lifetime_hours numeric,
  peak_delay_hours numeric,
  trend_grade text,
  trend_grade_detail jsonb,
  context text,
  context_ko text,
  context_ja text,
  context_zh text,
  source_url text,
  source_title text,
  source_image_url text,
  source_snippet text,
  metadata jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_ktrenz_keywords_keyword_ko ON public.ktrenz_keywords (keyword_ko) WHERE keyword_ko IS NOT NULL AND status IN ('pending', 'active');
CREATE UNIQUE INDEX idx_ktrenz_keywords_keyword ON public.ktrenz_keywords (keyword) WHERE keyword_ko IS NULL AND status IN ('pending', 'active');
CREATE INDEX idx_ktrenz_keywords_status ON public.ktrenz_keywords (status);
CREATE INDEX idx_ktrenz_keywords_category ON public.ktrenz_keywords (keyword_category);
CREATE INDEX idx_ktrenz_keywords_detected_at ON public.ktrenz_keywords (detected_at DESC);

-- 키워드-아티스트 연결 테이블
CREATE TABLE public.ktrenz_keyword_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword_id uuid NOT NULL REFERENCES public.ktrenz_keywords(id) ON DELETE CASCADE,
  star_id uuid REFERENCES public.ktrenz_stars(id) ON DELETE SET NULL,
  artist_name text NOT NULL,
  trigger_type text NOT NULL DEFAULT 'news_mention',
  trigger_source text NOT NULL DEFAULT 'naver_news',
  source_url text,
  source_title text,
  source_image_url text,
  source_snippet text,
  context text,
  context_ko text,
  context_ja text,
  context_zh text,
  confidence numeric DEFAULT 0,
  commercial_intent text,
  brand_intent text,
  fan_sentiment text,
  trend_potential numeric,
  purchase_stage text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ktrenz_keyword_sources_keyword_id ON public.ktrenz_keyword_sources (keyword_id);
CREATE INDEX idx_ktrenz_keyword_sources_star_id ON public.ktrenz_keyword_sources (star_id);
CREATE INDEX idx_ktrenz_keyword_sources_kw_star ON public.ktrenz_keyword_sources (keyword_id, star_id);
CREATE INDEX idx_ktrenz_keyword_sources_created_at ON public.ktrenz_keyword_sources (created_at DESC);

ALTER TABLE public.ktrenz_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ktrenz_keyword_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read keywords" ON public.ktrenz_keywords FOR SELECT USING (true);
CREATE POLICY "Anyone can read keyword sources" ON public.ktrenz_keyword_sources FOR SELECT USING (true);
