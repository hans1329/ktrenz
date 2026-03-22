-- Delete all trend triggers from today's sessions
DELETE FROM ktrenz_trend_triggers WHERE created_at >= '2026-03-22 04:00:00+00';

-- Mark all pipeline states as done
UPDATE ktrenz_pipeline_state SET status = 'done', updated_at = now() WHERE status NOT IN ('done');