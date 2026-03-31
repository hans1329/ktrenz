-- youtube_track_quota 레코드를 done으로 전환 (파이프라인 phase가 아님)
UPDATE ktrenz_pipeline_state 
SET status = 'done', updated_at = now() 
WHERE phase = 'youtube_track_quota' AND status = 'running';

-- 16시간 넘게 멈춘 detect phase를 error로 전환하여 stale lock 해제
UPDATE ktrenz_pipeline_state 
SET status = 'error', last_error = 'Stale: blocked by youtube_track_quota', updated_at = now()
WHERE run_id = 'run_1774904402383' AND phase = 'detect' AND status = 'running';