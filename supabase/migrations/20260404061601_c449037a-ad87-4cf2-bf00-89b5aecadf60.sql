UPDATE ktrenz_pipeline_state 
SET status = 'running', 
    error_count = 0, 
    current_offset = 40, 
    last_error = 'manual_recovery: skipped stuck batch at offset 30',
    updated_at = now()
WHERE run_id = 'run_1775280360062' AND phase = 'detect' AND status = 'error';