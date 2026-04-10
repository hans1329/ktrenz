
CREATE TABLE public.ktrenz_b2_batch_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  star_id UUID NOT NULL,
  batch_id TEXT NOT NULL,
  queue_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  result JSONB,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_b2_batch_queue_status ON public.ktrenz_b2_batch_queue (status, queue_order);
CREATE INDEX idx_b2_batch_queue_batch ON public.ktrenz_b2_batch_queue (batch_id);

ALTER TABLE public.ktrenz_b2_batch_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read batch queue"
ON public.ktrenz_b2_batch_queue FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Service role can manage batch queue"
ON public.ktrenz_b2_batch_queue FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
