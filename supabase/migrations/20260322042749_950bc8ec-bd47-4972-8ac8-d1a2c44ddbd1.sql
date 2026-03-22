-- Stop all running pipeline states
UPDATE ktrenz_pipeline_state SET status = 'done', updated_at = now() WHERE status IN ('running', 'postprocess_requested', 'postprocess_running');

-- Delete all trend triggers from this session
DELETE FROM ktrenz_trend_triggers WHERE created_at >= '2026-03-22 04:00:00+00';

-- Reset pipeline state for clean start
INSERT INTO ktrenz_pipeline_state (run_id, phase, status, current_offset, total_candidates)
VALUES ('reset_' || extract(epoch from now())::text, 'idle', 'done', 0, 481);