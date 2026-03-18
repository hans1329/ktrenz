CREATE OR REPLACE FUNCTION public.ktrenz_increment_points(p_user_id uuid, p_amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO ktrenz_user_points (user_id, points, lifetime_points)
  VALUES (p_user_id, p_amount, p_amount)
  ON CONFLICT (user_id)
  DO UPDATE SET
    points = ktrenz_user_points.points + p_amount,
    lifetime_points = ktrenz_user_points.lifetime_points + p_amount,
    updated_at = now();
END;
$$;