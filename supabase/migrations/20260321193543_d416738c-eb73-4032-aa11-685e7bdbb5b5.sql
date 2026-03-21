DELETE FROM ktrenz_trend_triggers WHERE status IN ('active', 'pending', 'tracking');
UPDATE ktrenz_pipeline_state SET phase = 'idle', current_offset = 0, postprocess_done = false, updated_at = now();