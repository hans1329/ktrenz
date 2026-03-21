UPDATE ktrenz_pipeline_state 
SET status = 'done', updated_at = now() 
WHERE run_id = 'run_1774077008130' 
  AND phase = 'detect_global' 
  AND status = 'running';