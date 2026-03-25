-- T2 전체 데이터 리셋
TRUNCATE TABLE ktrenz_trend_tracking;
TRUNCATE TABLE ktrenz_trend_artist_grades;
TRUNCATE TABLE ktrenz_trend_bets;
TRUNCATE TABLE ktrenz_trend_triggers CASCADE;

-- pipeline state도 리셋 (detect/postprocess/grade/track 관련)
DELETE FROM ktrenz_pipeline_state WHERE phase LIKE 'detect%' OR phase LIKE 'postprocess%' OR phase LIKE 'grade%' OR phase LIKE 'track%';