
-- 1) 카테고리별 FES 기여도 (스냅샷마다 어떤 카테고리가 얼마나 FES 변동에 기여했는지)
CREATE TABLE public.ktrenz_fes_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wiki_entry_id UUID NOT NULL,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 정규화된 변동률 (z-score 기반)
  youtube_z NUMERIC DEFAULT 0,
  buzz_z NUMERIC DEFAULT 0,
  album_z NUMERIC DEFAULT 0,
  music_z NUMERIC DEFAULT 0,
  social_z NUMERIC DEFAULT 0,
  -- 가중 기여도 (%)
  youtube_contrib NUMERIC DEFAULT 0,
  buzz_contrib NUMERIC DEFAULT 0,
  album_contrib NUMERIC DEFAULT 0,
  music_contrib NUMERIC DEFAULT 0,
  social_contrib NUMERIC DEFAULT 0,
  -- 정규화 적용 후 FES
  normalized_fes NUMERIC DEFAULT 0,
  -- 주도 카테고리
  leading_category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fes_contributions_entry ON public.ktrenz_fes_contributions(wiki_entry_id, snapshot_at DESC);

-- 2) 카테고리별 독립 트렌드 (7d/30d rolling stats)
CREATE TABLE public.ktrenz_category_trends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wiki_entry_id UUID NOT NULL,
  category TEXT NOT NULL, -- youtube, buzz, album, music, social
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 7일 통계
  avg_7d NUMERIC DEFAULT 0,
  stddev_7d NUMERIC DEFAULT 0,
  change_7d NUMERIC DEFAULT 0,
  -- 30일 통계
  avg_30d NUMERIC DEFAULT 0,
  stddev_30d NUMERIC DEFAULT 0,
  change_30d NUMERIC DEFAULT 0,
  -- 트렌드 방향
  trend_direction TEXT DEFAULT 'flat', -- rising, falling, flat, spike
  momentum NUMERIC DEFAULT 0, -- 7d vs 30d 비교 모멘텀
  UNIQUE(wiki_entry_id, category, calculated_at)
);

CREATE INDEX idx_category_trends_entry ON public.ktrenz_category_trends(wiki_entry_id, category, calculated_at DESC);

-- 3) 예측 로그 (에이전트 학습 및 예측 기록)
CREATE TABLE public.ktrenz_prediction_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wiki_entry_id UUID NOT NULL,
  predicted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  prediction_type TEXT NOT NULL, -- 'fes_direction', 'category_spike', 'album_impact'
  -- 예측 내용
  prediction JSONB NOT NULL DEFAULT '{}',
  -- 예측 근거 (어떤 패턴을 참조했는지)
  reasoning TEXT,
  features_used JSONB DEFAULT '{}', -- 입력 피처 스냅샷
  -- 결과 검증
  outcome JSONB, -- 실제 결과
  accuracy_score NUMERIC, -- 예측 정확도 (0-1)
  verified_at TIMESTAMPTZ,
  -- 메타
  model_version TEXT DEFAULT 'v1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_prediction_logs_entry ON public.ktrenz_prediction_logs(wiki_entry_id, predicted_at DESC);
CREATE INDEX idx_prediction_logs_type ON public.ktrenz_prediction_logs(prediction_type, predicted_at DESC);

-- 4) 정규화 기준 통계 (전체 아티스트의 카테고리별 분포)
CREATE TABLE public.ktrenz_normalization_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  mean_change NUMERIC DEFAULT 0,
  stddev_change NUMERIC DEFAULT 0,
  median_change NUMERIC DEFAULT 0,
  sample_count INTEGER DEFAULT 0,
  UNIQUE(category, calculated_at)
);

CREATE INDEX idx_norm_stats_cat ON public.ktrenz_normalization_stats(category, calculated_at DESC);

-- RLS
ALTER TABLE public.ktrenz_fes_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ktrenz_category_trends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ktrenz_prediction_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ktrenz_normalization_stats ENABLE ROW LEVEL SECURITY;

-- 읽기 허용 (인증 유저)
CREATE POLICY "Authenticated users can read fes contributions" ON public.ktrenz_fes_contributions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read category trends" ON public.ktrenz_category_trends FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read prediction logs" ON public.ktrenz_prediction_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read normalization stats" ON public.ktrenz_normalization_stats FOR SELECT TO authenticated USING (true);

-- Service role만 쓰기 (에지 함수에서만 사용)
CREATE POLICY "Service role can manage fes contributions" ON public.ktrenz_fes_contributions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role can manage category trends" ON public.ktrenz_category_trends FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role can manage prediction logs" ON public.ktrenz_prediction_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role can manage normalization stats" ON public.ktrenz_normalization_stats FOR ALL TO service_role USING (true) WITH CHECK (true);
