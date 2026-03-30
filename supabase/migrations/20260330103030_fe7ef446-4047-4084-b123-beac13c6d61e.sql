-- 전체 트렌드 데이터 리셋 (CASCADE로 FK 제약 해소)
TRUNCATE TABLE ktrenz_trend_tracking, ktrenz_keyword_sources, ktrenz_keywords, ktrenz_social_snapshots, ktrenz_trend_bets, ktrenz_trend_triggers, ktrenz_pipeline_state CASCADE;

-- ktrenz_stars 감지 상태 초기화
UPDATE ktrenz_stars SET last_detected_at = NULL, last_detect_result = NULL;