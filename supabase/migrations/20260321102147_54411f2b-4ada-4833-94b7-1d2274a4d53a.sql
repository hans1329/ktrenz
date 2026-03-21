-- Clean ALL duplicate phase rows: keep only the oldest per (run_id, phase)
DELETE FROM ktrenz_pipeline_state
WHERE id NOT IN (
  SELECT DISTINCT ON (run_id, phase) id
  FROM ktrenz_pipeline_state
  ORDER BY run_id, phase, created_at ASC
);

-- Reset the current detect_global to offset 0
UPDATE ktrenz_pipeline_state 
SET current_offset = 0, updated_at = now()
WHERE run_id = 'run_1774087141731' AND phase = 'detect_global';

-- Now add the unique constraint
ALTER TABLE ktrenz_pipeline_state 
ADD CONSTRAINT uq_pipeline_run_phase UNIQUE (run_id, phase);