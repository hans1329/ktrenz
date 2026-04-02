-- Function to grant welcome bonus points on profile creation
CREATE OR REPLACE FUNCTION public.ktrenz_grant_welcome_bonus()
RETURNS TRIGGER AS $$
BEGIN
  NEW.available_points := COALESCE(NEW.available_points, 0) + 100;
  NEW.total_points := COALESCE(NEW.total_points, 0) + 100;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger on profiles INSERT
CREATE TRIGGER ktrenz_welcome_bonus_on_profile_create
BEFORE INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.ktrenz_grant_welcome_bonus();