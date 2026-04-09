
-- B2 수집 실행 기록
CREATE TABLE public.ktrenz_b2_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  star_id UUID NOT NULL,
  content_score INTEGER NOT NULL DEFAULT 0,
  counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ktrenz_b2_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read b2 runs"
  ON public.ktrenz_b2_runs FOR SELECT USING (true);

CREATE INDEX idx_b2_runs_star ON public.ktrenz_b2_runs (star_id);
CREATE INDEX idx_b2_runs_created ON public.ktrenz_b2_runs (created_at DESC);

-- B2 개별 콘텐츠 카드
CREATE TABLE public.ktrenz_b2_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.ktrenz_b2_runs(id) ON DELETE CASCADE,
  star_id UUID NOT NULL,
  source TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  thumbnail TEXT,
  has_thumbnail BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  engagement_score INTEGER NOT NULL DEFAULT 0,
  card_status TEXT NOT NULL DEFAULT 'available',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ktrenz_b2_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read b2 items"
  ON public.ktrenz_b2_items FOR SELECT USING (true);

CREATE INDEX idx_b2_items_run ON public.ktrenz_b2_items (run_id);
CREATE INDEX idx_b2_items_star ON public.ktrenz_b2_items (star_id);
CREATE INDEX idx_b2_items_source ON public.ktrenz_b2_items (source);
CREATE INDEX idx_b2_items_status ON public.ktrenz_b2_items (card_status);
CREATE INDEX idx_b2_items_engagement ON public.ktrenz_b2_items (engagement_score DESC);
CREATE INDEX idx_b2_items_thumbnail ON public.ktrenz_b2_items (has_thumbnail);
