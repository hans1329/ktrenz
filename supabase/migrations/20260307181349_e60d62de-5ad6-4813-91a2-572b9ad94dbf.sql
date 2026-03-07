CREATE POLICY "Admins can view all agent slots"
ON public.ktrenz_agent_slots
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));