-- 키워드 데이터 전체 리셋 (수집/추적/등급/쇼핑/파이프라인)
TRUNCATE TABLE ktrenz_trend_tracking;
TRUNCATE TABLE ktrenz_shopping_tracking;
TRUNCATE TABLE ktrenz_trend_artist_grades;
DELETE FROM ktrenz_trend_triggers;
DELETE FROM ktrenz_pipeline_state;
DELETE FROM ktrenz_collection_log;