
-- Clean all existing prescore data
DELETE FROM public.ktrenz_b2_prescores WHERE id IS NOT NULL;

-- Add unique constraint to prevent duplicates
ALTER TABLE public.ktrenz_b2_prescores
ADD CONSTRAINT uq_prescores_star_batch UNIQUE (star_id, batch_id);
