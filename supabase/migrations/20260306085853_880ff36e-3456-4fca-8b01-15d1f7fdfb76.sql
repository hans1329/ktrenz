
-- Trigger: auto-credit ktrenz_user_points when a transaction is inserted
CREATE OR REPLACE FUNCTION public.ktrenz_credit_points_on_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO ktrenz_user_points (user_id, points)
  VALUES (NEW.user_id, NEW.amount)
  ON CONFLICT (user_id)
  DO UPDATE SET points = ktrenz_user_points.points + NEW.amount,
               updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ktrenz_credit_points
AFTER INSERT ON public.ktrenz_point_transactions
FOR EACH ROW
EXECUTE FUNCTION public.ktrenz_credit_points_on_transaction();
