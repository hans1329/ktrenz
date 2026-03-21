-- 기존 데이터 초기화 (FK 순서 준수)
TRUNCATE TABLE ktrenz_trend_tracking CASCADE;
TRUNCATE TABLE ktrenz_trend_bets CASCADE;
TRUNCATE TABLE ktrenz_trend_markets CASCADE;
TRUNCATE TABLE ktrenz_trend_triggers CASCADE;
TRUNCATE TABLE ktrenz_pipeline_state CASCADE;