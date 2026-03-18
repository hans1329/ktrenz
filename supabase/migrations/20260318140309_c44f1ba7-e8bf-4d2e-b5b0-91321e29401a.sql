CREATE OR REPLACE FUNCTION public.increment_points(user_id uuid, amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET total_points = COALESCE(total_points, 0) + amount,
      available_points = COALESCE(available_points, 0) + amount
  WHERE id = user_id;
END;
$$;