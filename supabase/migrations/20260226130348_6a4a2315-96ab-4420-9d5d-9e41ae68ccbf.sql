
-- login_count 증가 함수 (upsert 후 호출)
CREATE OR REPLACE FUNCTION public.increment_ktrenz_login_count(_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE ktrenz_user_logins
  SET login_count = login_count + 1,
      last_login_at = now()
  WHERE user_id = _user_id;
$$;
