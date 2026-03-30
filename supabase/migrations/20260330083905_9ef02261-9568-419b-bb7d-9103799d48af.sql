
-- ktrenz_keywords에 추적 관련 컬럼 추가 (baseline, peak, influence, last_tracked_at, peak_at)
ALTER TABLE public.ktrenz_keywords
  ADD COLUMN IF NOT EXISTS baseline_score numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peak_score numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS influence_index numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peak_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_tracked_at timestamptz;

-- ktrenz_trend_tracking에 keyword_id 컬럼 추가 (새 테이블 참조)
ALTER TABLE public.ktrenz_trend_tracking
  ADD COLUMN IF NOT EXISTS keyword_id uuid REFERENCES public.ktrenz_keywords(id);

-- keyword_id 인덱스
CREATE INDEX IF NOT EXISTS idx_ktrenz_trend_tracking_keyword_id ON public.ktrenz_trend_tracking (keyword_id);
