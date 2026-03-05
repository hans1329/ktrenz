
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
  _today date := current_date;
BEGIN
  SELECT COALESCE(
    (SELECT CASE
       WHEN ks.tier_id = 3 THEN 'pro'
       WHEN ks.tier_id = 2 THEN 'basic'
       ELSE 'free'
     END
     FROM kpass_subscriptions ks
     WHERE ks.user_id = _user_id AND ks.status = 'active'
     ORDER BY ks.tier_id DESC LIMIT 1),
    'free'
  ) INTO _tier;

  _limit := CASE _tier
    WHEN 'pro' THEN 100
    WHEN 'basic' THEN 50
    ELSE 30
  END;

  SELECT COALESCE(used_count, 0) INTO _used
  FROM ktrenz_agent_daily_usage
  WHERE user_id = _user_id AND usage_date = _today;

  IF _used IS NULL THEN _used := 0; END IF;

  IF _used < _limit THEN
    INSERT INTO ktrenz_agent_daily_usage (user_id, usage_date, used_count)
    VALUES (_user_id, _today, 1)
    ON CONFLICT (user_id, usage_date)
    DO UPDATE SET used_count = ktrenz_agent_daily_usage.used_count + 1,
                  updated_at = now();
    RETURN jsonb_build_object('allowed', true, 'used', _used + 1, 'daily_limit', _limit, 'tier', _tier, 'point_used', false);
  END IF;

  SELECT COALESCE(SUM(CASE WHEN type = 'earn' THEN amount ELSE -amount END), 0)
  INTO _points
  FROM ktrenz_point_transactions
  WHERE user_id = _user_id;

  IF _points >= 5 THEN
    INSERT INTO ktrenz_point_transactions (user_id, amount, type, description)
    VALUES (_user_id, 5, 'spend', 'Fan Agent 추가 메시지');

    INSERT INTO ktrenz_agent_daily_usage (user_id, usage_date, used_count)
    VALUES (_user_id, _today, _used + 1)
    ON CONFLICT (user_id, usage_date)
    DO UPDATE SET used_count = ktrenz_agent_daily_usage.used_count + 1,
                  updated_at = now();

    RETURN jsonb_build_object('allowed', true, 'used', _used + 1, 'daily_limit', _limit, 'tier', _tier, 'point_used', true);
  END IF;

  RETURN jsonb_build_object('allowed', false, 'used', _used, 'daily_limit', _limit, 'tier', _tier, 'reason', 'no_points');
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
  _today date := current_date;
BEGIN
  SELECT COALESCE(
    (SELECT CASE
       WHEN ks.tier_id = 3 THEN 'pro'
       WHEN ks.tier_id = 2 THEN 'basic'
       ELSE 'free'
     END
     FROM kpass_subscriptions ks
     WHERE ks.user_id = _user_id AND ks.status = 'active'
     ORDER BY ks.tier_id DESC LIMIT 1),
    'free'
  ) INTO _tier;

  _limit := CASE _tier
    WHEN 'pro' THEN 100
    WHEN 'basic' THEN 50
    ELSE 30
  END;

  SELECT COALESCE(used_count, 0) INTO _used
  FROM ktrenz_agent_daily_usage
  WHERE user_id = _user_id AND usage_date = _today;

  IF _used IS NULL THEN _used := 0; END IF;

  RETURN jsonb_build_object('used', _used, 'daily_limit', _limit, 'remaining', GREATEST(_limit - _used, 0), 'tier', _tier);
END;
$$;
