-- 파이프라인 상태 리셋 (이전 run 완료 처리)
UPDATE ktrenz_pipeline_state SET status = 'done' WHERE status != 'done';

-- ktrenz_stars의 감지 상태 초기화
UPDATE ktrenz_stars SET last_detected_at = NULL, last_detect_result = NULL WHERE last_detected_at IS NOT NULL;

-- 트렌드 등급 테이블 초기화
TRUNCATE ktrenz_trend_artist_grades;

-- 트렌드 트래킹 초기화
TRUNCATE ktrenz_trend_tracking;

-- 쇼핑 트래킹 초기화
TRUNCATE ktrenz_shopping_tracking;