TRUNCATE ktrenz_trend_tracking CASCADE;
TRUNCATE ktrenz_trend_triggers CASCADE;
UPDATE ktrenz_pipeline_state SET status = 'done' WHERE status IN ('running', 'postprocess_requested', 'postprocess_running');