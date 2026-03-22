-- Force stop the running pipeline
UPDATE ktrenz_pipeline_state SET status = 'done', updated_at = now() WHERE run_id = 'run_1774153692162' AND status = 'running';

-- Also clean up idle state
UPDATE ktrenz_pipeline_state SET status = 'done', updated_at = now() WHERE run_id = 'run_1774116657272' AND status = 'idle';