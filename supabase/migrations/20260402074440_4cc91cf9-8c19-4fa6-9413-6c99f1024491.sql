-- pending 제거를 위한 postprocessed_at 마커 컬럼 추가
ALTER TABLE ktrenz_trend_triggers ADD COLUMN IF NOT EXISTS postprocessed_at timestamptz DEFAULT NULL;
ALTER TABLE ktrenz_keywords ADD COLUMN IF NOT EXISTS postprocessed_at timestamptz DEFAULT NULL;

-- 기존 active 데이터는 이미 처리된 것으로 마킹
UPDATE ktrenz_trend_triggers SET postprocessed_at = detected_at WHERE status = 'active' AND postprocessed_at IS NULL;
UPDATE ktrenz_keywords SET postprocessed_at = created_at WHERE status = 'active' AND postprocessed_at IS NULL;