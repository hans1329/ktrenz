CREATE OR REPLACE FUNCTION public.ktrenz_check_agent_usage(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tier text;
  _limit int;
  _used int;
  _bonus int;
  _today date := current_date;
BEGIN
  SELECT COALESCE(
    (
      SELECT CASE
        WHEN ks.tier_id = 3 THEN 'pro'
        WHEN ks.tier_id = 2 THEN 'basic'
        ELSE 'free'
      END
      FROM public.kpass_subscriptions ks
      WHERE ks.user_id = _user_id
        AND ks.status = 'active'
      ORDER BY ks.tier_id DESC
      LIMIT 1
    ),
    'free'
  ) INTO _tier;

  _limit := CASE _tier
    WHEN 'pro' THEN 100
    WHEN 'basic' THEN 50
    ELSE 30
  END;

  SELECT COALESCE(au.message_count, 0), COALESCE(au.bonus_remaining, 0)
  INTO _used, _bonus
  FROM public.ktrenz_agent_daily_usage au
  WHERE au.user_id = _user_id
    AND au.usage_date = _today;

  IF _used IS NULL THEN _used := 0; END IF;
  IF _bonus IS NULL THEN _bonus := 0; END IF;

  -- Free daily quota
  IF _used < _limit THEN
    INSERT INTO public.ktrenz_agent_daily_usage (user_id, usage_date, message_count, points_spent, bonus_remaining)
    VALUES (_user_id, _today, 1, 0, 0)
    ON CONFLICT (user_id, usage_date)
    DO UPDATE SET
      message_count = public.ktrenz_agent_daily_usage.message_count + 1,
      updated_at = now();

    RETURN jsonb_build_object(
      'allowed', true,
      'used', _used + 1,
      'daily_limit', _limit,
      'tier', _tier,
      'point_used', false,
      'bonus_remaining', _bonus
    );
  END IF;

  -- Purchased bonus quota
  IF _bonus > 0 THEN
    UPDATE public.ktrenz_agent_daily_usage
    SET message_count = message_count + 1,
        bonus_remaining = bonus_remaining - 1,
        updated_at = now()
    WHERE user_id = _user_id
      AND usage_date = _today;

    RETURN jsonb_build_object(
      'allowed', true,
      'used', _used + 1,
      'daily_limit', _limit,
      'tier', _tier,
      'point_used', true,
      'bonus_remaining', _bonus - 1
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', false,
    'used', _used,
    'daily_limit', _limit,
    'tier', _tier,
    'reason', 'no_bonus',
    'bonus_remaining', 0
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ktrenz_get_agent_usage(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tier text;
  _limit int;
  _used int;
  _bonus int;
  _today date := current_date;
BEGIN
  SELECT COALESCE(
    (
      SELECT CASE
        WHEN ks.tier_id = 3 THEN 'pro'
        WHEN ks.tier_id = 2 THEN 'basic'
        ELSE 'free'
      END
      FROM public.kpass_subscriptions ks
      WHERE ks.user_id = _user_id
        AND ks.status = 'active'
      ORDER BY ks.tier_id DESC
      LIMIT 1
    ),
    'free'
  ) INTO _tier;

  _limit := CASE _tier
    WHEN 'pro' THEN 100
    WHEN 'basic' THEN 50
    ELSE 30
  END;

  SELECT COALESCE(au.message_count, 0), COALESCE(au.bonus_remaining, 0)
  INTO _used, _bonus
  FROM public.ktrenz_agent_daily_usage au
  WHERE au.user_id = _user_id
    AND au.usage_date = _today;

  IF _used IS NULL THEN _used := 0; END IF;
  IF _bonus IS NULL THEN _bonus := 0; END IF;

  RETURN jsonb_build_object(
    'used', _used,
    'daily_limit', _limit,
    'remaining', GREATEST(_limit - _used, 0) + _bonus,
    'bonus_remaining', _bonus,
    'tier', _tier
  );
END;
$$;