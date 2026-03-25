-- 전체 데이터 리셋 (CASCADE로 FK 제약 해결)
TRUNCATE TABLE ktrenz_trend_tracking CASCADE;
TRUNCATE TABLE ktrenz_trend_triggers CASCADE;
TRUNCATE TABLE ktrenz_data_snapshots CASCADE;
TRUNCATE TABLE ktrenz_pipeline_state CASCADE;