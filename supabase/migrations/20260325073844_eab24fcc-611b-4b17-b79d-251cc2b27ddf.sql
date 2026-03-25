CREATE POLICY "Anyone can view pipeline status"
ON public.ktrenz_pipeline_state
FOR SELECT
TO anon, authenticated
USING (true);