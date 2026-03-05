
CREATE OR REPLACE FUNCTION public.ktrenz_purchase_agent_slot(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _points int;
  _cost int := 1000;
BEGIN
  SELECT COALESCE(points, 0) INTO _points
  FROM ktrenz_user_points
  WHERE user_id = _user_id;

  IF _points < _cost THEN
    RETURN jsonb_build_object('success', false, 'reason', 'insufficient_points');
  END IF;

  UPDATE ktrenz_user_points
  SET points = points - _cost, updated_at = now()
  WHERE user_id = _user_id;

  INSERT INTO ktrenz_point_transactions (user_id, amount, reason, description)
  VALUES (_user_id, -_cost, 'agent_slot_purchase', 'Additional agent slot');

  INSERT INTO ktrenz_agent_slot_purchases (user_id, point_cost)
  VALUES (_user_id, _cost);

  RETURN jsonb_build_object('success', true);
END;
$$;
