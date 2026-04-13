
CREATE OR REPLACE FUNCTION public.ktrenz_admin_user_emails(_user_ids uuid[])
RETURNS TABLE(user_id uuid, email text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT au.id, au.email, au.created_at
  FROM auth.users au
  WHERE au.id = ANY(_user_ids);
$$;
