DROP FUNCTION IF EXISTS public.ktrenz_check_agent_usage(uuid);

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
  _points int;
  _cost int := 5;
  _today date := current_date;
  _deducted_rows int := 0;
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

  -- 테스트용: 전 등급 3건
  _limit := CASE _tier
    WHEN 'pro' THEN 3
    WHEN 'basic' THEN 3
    ELSE 3
  END;

  SELECT COALESCE(au.message_count, 0)
  INTO _used
  FROM public.ktrenz_agent_daily_usage au
  WHERE au.user_id = _user_id
    AND au.usage_date = _today;

  IF _used IS NULL THEN
    _used := 0;
  END IF;

  -- 무료 한도 내: 메시지 카운트만 증가
  IF _used < _limit THEN
    INSERT INTO public.ktrenz_agent_daily_usage (user_id, usage_date, message_count, points_spent)
    VALUES (_user_id, _today, 1, 0)
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
      'cost', 0
    );
  END IF;

  -- 한도 초과: 포인트 차감 시도
  SELECT COALESCE(up.points, 0)
  INTO _points
  FROM public.ktrenz_user_points up
  WHERE up.user_id = _user_id;

  IF _points IS NULL THEN
    _points := 0;
  END IF;

  IF _points < _cost THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'used', _used,
      'daily_limit', _limit,
      'tier', _tier,
      'reason', 'no_points',
      'cost', _cost,
      'points', _points
    );
  END IF;

  UPDATE public.ktrenz_user_points
  SET points = points - _cost,
      updated_at = now()
  WHERE user_id = _user_id
    AND points >= _cost;

  GET DIAGNOSTICS _deducted_rows = ROW_COUNT;

  IF _deducted_rows = 0 THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'used', _used,
      'daily_limit', _limit,
      'tier', _tier,
      'reason', 'no_points',
      'cost', _cost,
      'points', 0
    );
  END IF;

  INSERT INTO public.ktrenz_point_transactions (user_id, amount, reason, description)
  VALUES (_user_id, -_cost, 'fan_agent_extra_message', 'Fan Agent 추가 메시지');

  INSERT INTO public.ktrenz_agent_daily_usage (user_id, usage_date, message_count, points_spent)
  VALUES (_user_id, _today, 1, _cost)
  ON CONFLICT (user_id, usage_date)
  DO UPDATE SET
    message_count = public.ktrenz_agent_daily_usage.message_count + 1,
    points_spent = public.ktrenz_agent_daily_usage.points_spent + _cost,
    updated_at = now();

  RETURN jsonb_build_object(
    'allowed', true,
    'used', _used + 1,
    'daily_limit', _limit,
    'tier', _tier,
    'point_used', true,
    'cost', _cost
  );
END;
$$;