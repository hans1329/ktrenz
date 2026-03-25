-- 전체 트렌드 데이터 리셋
TRUNCATE TABLE ktrenz_trend_tracking;
TRUNCATE TABLE ktrenz_trend_artist_grades;

-- triggers: active → expired 처리
UPDATE ktrenz_trend_triggers SET status = 'expired', trend_score = NULL, trend_score_details = NULL, trend_grade = NULL WHERE status = 'active';

-- pipeline state 리셋 (trend 관련 phase)
DELETE FROM ktrenz_pipeline_state WHERE phase IN ('detect', 'grade', 'track', 'settle', 'postprocess');