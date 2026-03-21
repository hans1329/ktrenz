UPDATE ktrenz_pipeline_state
SET status = 'done'
WHERE status IN ('running', 'postprocess_requested', 'postprocess_running');