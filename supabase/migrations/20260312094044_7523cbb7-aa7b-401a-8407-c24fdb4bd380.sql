
-- 롤링 윈도우 Velocity 통계 (7d/30d/90d)
CREATE TABLE public.ktrenz_velocity_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wiki_entry_id UUID NOT NULL,
  category TEXT NOT NULL,
  time_window TEXT NOT NULL,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  avg_velocity NUMERIC DEFAULT 0,
  max_velocity NUMERIC DEFAULT 0,
  min_velocity NUMERIC DEFAULT 0,
  stddev_velocity NUMERIC DEFAULT 0,
  avg_intensity NUMERIC DEFAULT 0,
  velocity_trend TEXT DEFAULT 'flat',
  spike_count INT DEFAULT 0,
  drop_count INT DEFAULT 0,
  peak_day TIMESTAMPTZ,
  trough_day TIMESTAMPTZ,
  sample_count INT DEFAULT 0
);

CREATE UNIQUE INDEX idx_velocity_stats_unique 
  ON ktrenz_velocity_stats(wiki_entry_id, category, time_window);
CREATE INDEX idx_velocity_stats_trend 
  ON ktrenz_velocity_stats(category, velocity_trend);

-- 이벤트 프로파일 요약 (아티스트별 이벤트 타입별 평균 패턴)
CREATE TABLE public.ktrenz_velocity_profile_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wiki_entry_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  category TEXT NOT NULL,
  avg_pre_velocity NUMERIC DEFAULT 0,
  avg_peak_velocity NUMERIC DEFAULT 0,
  avg_post_velocity NUMERIC DEFAULT 0,
  avg_peak_day_offset INT DEFAULT 0,
  avg_recovery_days INT,
  event_count INT DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_velocity_profile_summary_unique
  ON ktrenz_velocity_profile_summary(wiki_entry_id, event_type, category);
