
-- T2: K-pop Star Triggered Trends 전용 테이블

-- 1) 트렌드 트리거: 아티스트 이벤트에서 감지된 상업 키워드
CREATE TABLE public.ktrenz_trend_triggers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wiki_entry_id UUID NOT NULL,
  star_id UUID REFERENCES public.ktrenz_stars(id),
  trigger_type TEXT NOT NULL DEFAULT 'news_mention',
  trigger_source TEXT NOT NULL DEFAULT 'naver_news',
  artist_name TEXT NOT NULL,
  keyword TEXT NOT NULL,
  keyword_category TEXT NOT NULL DEFAULT 'brand',
  context TEXT,
  confidence NUMERIC(3,2) DEFAULT 0.5,
  source_url TEXT,
  source_title TEXT,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) 트렌드 추적: 추출된 키워드의 Google Trends 검색량 추적
CREATE TABLE public.ktrenz_trend_tracking (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trigger_id UUID NOT NULL REFERENCES public.ktrenz_trend_triggers(id) ON DELETE CASCADE,
  wiki_entry_id UUID NOT NULL,
  keyword TEXT NOT NULL,
  search_volume INTEGER DEFAULT 0,
  interest_score INTEGER DEFAULT 0,
  region TEXT DEFAULT 'worldwide',
  tracked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delta_pct NUMERIC(8,2) DEFAULT 0,
  raw_response JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 인덱스
CREATE INDEX idx_trend_triggers_wiki_entry ON public.ktrenz_trend_triggers(wiki_entry_id);
CREATE INDEX idx_trend_triggers_keyword ON public.ktrenz_trend_triggers(keyword);
CREATE INDEX idx_trend_triggers_status ON public.ktrenz_trend_triggers(status);
CREATE INDEX idx_trend_triggers_detected_at ON public.ktrenz_trend_triggers(detected_at DESC);
CREATE INDEX idx_trend_tracking_trigger ON public.ktrenz_trend_tracking(trigger_id);
CREATE INDEX idx_trend_tracking_wiki_entry ON public.ktrenz_trend_tracking(wiki_entry_id);
CREATE INDEX idx_trend_tracking_tracked_at ON public.ktrenz_trend_tracking(tracked_at DESC);

-- RLS 비활성화 (서버 사이드 Edge Function에서만 접근)
ALTER TABLE public.ktrenz_trend_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ktrenz_trend_tracking ENABLE ROW LEVEL SECURITY;

-- 서비스 롤 전용 정책
CREATE POLICY "Service role full access on trend_triggers" ON public.ktrenz_trend_triggers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on trend_tracking" ON public.ktrenz_trend_tracking FOR ALL USING (true) WITH CHECK (true);
