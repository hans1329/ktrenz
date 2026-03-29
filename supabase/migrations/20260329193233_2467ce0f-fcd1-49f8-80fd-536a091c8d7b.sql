-- 메가트렌드 플래그 및 관련 필드 추가
ALTER TABLE ktrenz_trend_triggers 
  ADD COLUMN IF NOT EXISTS is_mega_trend boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mega_trend_cluster text DEFAULT NULL;

-- 메가트렌드 조회 인덱스
CREATE INDEX IF NOT EXISTS idx_ktrenz_triggers_mega_trend 
  ON ktrenz_trend_triggers (is_mega_trend) WHERE is_mega_trend = true AND status = 'active';