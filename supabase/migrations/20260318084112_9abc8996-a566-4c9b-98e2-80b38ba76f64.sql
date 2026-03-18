CREATE POLICY "Admins can insert ktrenz_stars"
ON public.ktrenz_stars
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update ktrenz_stars"
ON public.ktrenz_stars
FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete ktrenz_stars"
ON public.ktrenz_stars
FOR DELETE
TO authenticated
USING (public.is_admin(auth.uid()));