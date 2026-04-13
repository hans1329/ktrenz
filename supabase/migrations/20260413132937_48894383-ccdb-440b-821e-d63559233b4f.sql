
CREATE OR REPLACE FUNCTION public.grant_welcome_bonus(_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _amount integer;
  _enabled boolean;
  _existing_id uuid;
BEGIN
  -- Check setting
  SELECT points, is_enabled INTO _amount, _enabled
  FROM ktrenz_point_settings
  WHERE reward_type = 'welcome_bonus'
  LIMIT 1;

  IF _amount IS NULL OR NOT _enabled THEN
    RETURN 0;
  END IF;

  -- Check duplicate
  SELECT id INTO _existing_id
  FROM ktrenz_point_transactions
  WHERE user_id = _user_id AND reason = 'welcome_bonus'
  LIMIT 1;

  IF _existing_id IS NOT NULL THEN
    RETURN 0;
  END IF;

  -- Record transaction (trigger trg_ktrenz_credit_points will handle ktrenz_user_points automatically)
  INSERT INTO ktrenz_point_transactions (user_id, amount, reason, description)
  VALUES (_user_id, _amount, 'welcome_bonus', 'Welcome bonus');

  RETURN _amount;
END;
$$;
