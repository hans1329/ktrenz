
-- 쇼핑 데이터 별도 테이블: 키워드별 쇼핑 추적 이력
CREATE TABLE public.ktrenz_shopping_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id UUID NOT NULL REFERENCES public.ktrenz_trend_triggers(id) ON DELETE CASCADE,
  star_id UUID REFERENCES public.ktrenz_stars(id) ON DELETE SET NULL,
  keyword TEXT NOT NULL,
  keyword_category TEXT,
  datalab_ratio NUMERIC(10,2) DEFAULT 0,
  datalab_trend_7d JSONB DEFAULT '[]'::jsonb,
  shop_total INTEGER DEFAULT 0,
  shop_recent_items INTEGER DEFAULT 0,
  composite_score NUMERIC(10,2) DEFAULT 0,
  search_volume NUMERIC(10,2) DEFAULT 0,
  tracked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_response JSONB DEFAULT '{}'::jsonb
);

-- 인덱스
CREATE INDEX idx_shopping_tracking_trigger ON public.ktrenz_shopping_tracking(trigger_id);
CREATE INDEX idx_shopping_tracking_star ON public.ktrenz_shopping_tracking(star_id);
CREATE INDEX idx_shopping_tracking_tracked_at ON public.ktrenz_shopping_tracking(tracked_at DESC);

-- RLS 비활성 (서비스 롤 키로만 접근)
ALTER TABLE public.ktrenz_shopping_tracking ENABLE ROW LEVEL SECURITY;

-- 기존 naver_shop 트리거를 naver_news로 일괄 전환
UPDATE public.ktrenz_trend_triggers
SET trigger_source = 'naver_news'
WHERE trigger_source = 'naver_shop' AND status = 'active';
