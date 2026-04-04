UPDATE public.ktrenz_pipeline_state 
SET status = 'running', 
    updated_at = now()
WHERE run_id = 'run_1775280360062' AND status = 'error';