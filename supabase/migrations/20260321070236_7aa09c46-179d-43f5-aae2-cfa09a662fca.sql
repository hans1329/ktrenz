-- Clean up stuck pipeline state records
UPDATE ktrenz_pipeline_state SET status = 'done' WHERE status = 'running';
