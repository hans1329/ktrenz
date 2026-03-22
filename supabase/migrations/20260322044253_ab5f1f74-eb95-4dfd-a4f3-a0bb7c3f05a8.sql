-- Stop the unauthorized run
UPDATE ktrenz_pipeline_state SET status = 'done', updated_at = now() WHERE run_id = 'run_1774154505354' AND status = 'running';

-- Delete any triggers created by this run
DELETE FROM ktrenz_trend_triggers WHERE created_at >= '2026-03-22 04:40:00+00';