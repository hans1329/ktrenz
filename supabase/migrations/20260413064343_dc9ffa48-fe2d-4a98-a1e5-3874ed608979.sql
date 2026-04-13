
-- Helper: calculate tier from total_points
CREATE OR REPLACE FUNCTION public.ktrenz_calc_tier(points INT)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN points >= 10000 THEN 4
    WHEN points >= 3000 THEN 3
    WHEN points >= 500 THEN 2
    ELSE 1
  END;
$$;

-- Trigger function: auto-update current_level when total_points changes
CREATE OR REPLACE FUNCTION public.ktrenz_sync_level()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_tier INT;
BEGIN
  IF NEW.total_points IS DISTINCT FROM OLD.total_points THEN
    new_tier := public.ktrenz_calc_tier(NEW.total_points);
    IF new_tier IS DISTINCT FROM COALESCE(OLD.current_level, 1) THEN
      NEW.current_level := new_tier;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Must fire BEFORE protect_points_trigger (alphabetical ordering)
DROP TRIGGER IF EXISTS a_sync_level ON public.profiles;
CREATE TRIGGER a_sync_level
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.ktrenz_sync_level();

-- Backfill existing users
DO $$
BEGIN
  PERFORM set_config('app.bypass_points_protection', 'true', true);
  UPDATE public.profiles
  SET current_level = public.ktrenz_calc_tier(total_points)
  WHERE current_level IS DISTINCT FROM public.ktrenz_calc_tier(total_points);
END;
$$;
