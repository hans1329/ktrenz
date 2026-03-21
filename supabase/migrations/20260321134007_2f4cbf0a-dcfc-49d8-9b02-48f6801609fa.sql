-- 트렌드 데이터 전체 리셋 (최근 7일 기사 건수 기반 재수집 준비)
TRUNCATE TABLE ktrenz_trend_tracking;
DELETE FROM ktrenz_trend_triggers;