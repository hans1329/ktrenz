-- Allow admins to read all fan agent messages for user management
CREATE POLICY "Admins can read all messages"
ON public.ktrenz_fan_agent_messages
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
);

-- Allow admins to update user points
CREATE POLICY "Admins can update user points"
ON public.ktrenz_user_points
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
);