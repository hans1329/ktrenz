-- 추가 구매 메시지 잔여량 컬럼
ALTER TABLE public.ktrenz_agent_daily_usage
ADD COLUMN IF NOT EXISTS bonus_remaining int NOT NULL DEFAULT 0;

-- RPC: 메시지 번들 구매
CREATE OR REPLACE FUNCTION public.ktrenz_purchase_agent_messages(_user_id uuid, _bundle int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cost int;
  _points int;
  _today date := current_date;
BEGIN
  -- 번들 검증 및 비용 계산 (건당 5P)
  IF _bundle NOT IN (5, 10, 20) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_bundle');
  END IF;

  _cost := _bundle * 5;

  -- 포인트 잔액 확인
  SELECT COALESCE(up.points, 0) INTO _points
  FROM public.ktrenz_user_points up WHERE up.user_id = _user_id;

  IF _points IS NULL OR _points < _cost THEN
    RETURN jsonb_build_object('success', false, 'reason', 'insufficient_points', 'points', COALESCE(_points, 0), 'cost', _cost);
  END IF;

  -- 포인트 차감
  UPDATE public.ktrenz_user_points
  SET points = points - _cost, updated_at = now()
  WHERE user_id = _user_id AND points >= _cost;

  -- 포인트 트랜잭션 기록
  INSERT INTO public.ktrenz_point_transactions (user_id, amount, reason, description)
  VALUES (_user_id, -_cost, 'fan_agent_bundle', 'Fan Agent 추가 메시지 ' || _bundle || '건 구매');

  -- 보너스 잔여량 추가
  INSERT INTO public.ktrenz_agent_daily_usage (user_id, usage_date, message_count, points_spent, bonus_remaining)
  VALUES (_user_id, _today, 0, _cost, _bundle)
  ON CONFLICT (user_id, usage_date)
  DO UPDATE SET
    bonus_remaining = public.ktrenz_agent_daily_usage.bonus_remaining + _bundle,
    points_spent = public.ktrenz_agent_daily_usage.points_spent + _cost,
    updated_at = now();

  RETURN jsonb_build_object('success', true, 'purchased', _bundle, 'cost', _cost, 'remaining_points', _points - _cost);
END;
$$;

-- ktrenz_check_agent_usage 수정: 보너스 잔여량 우선 사용
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
  _bonus int;
  _today date := current_date;
BEGIN
  SELECT COALESCE(
    (SELECT CASE WHEN ks.tier_id = 3 THEN 'pro' WHEN ks.tier_id = 2 THEN 'basic' ELSE 'free' END
     FROM public.kpass_subscriptions ks WHERE ks.user_id = _user_id AND ks.status = 'active'
     ORDER BY ks.tier_id DESC LIMIT 1), 'free') INTO _tier;

  _limit := CASE _tier WHEN 'pro' THEN 3 WHEN 'basic' THEN 3 ELSE 3 END;

  SELECT COALESCE(au.message_count, 0), COALESCE(au.bonus_remaining, 0)
  INTO _used, _bonus
  FROM public.ktrenz_agent_daily_usage au
  WHERE au.user_id = _user_id AND au.usage_date = _today;

  IF _used IS NULL THEN _used := 0; END IF;
  IF _bonus IS NULL THEN _bonus := 0; END IF;

  -- 무료 한도 내
  IF _used < _limit THEN
    INSERT INTO public.ktrenz_agent_daily_usage (user_id, usage_date, message_count, points_spent, bonus_remaining)
    VALUES (_user_id, _today, 1, 0, 0)
    ON CONFLICT (user_id, usage_date)
    DO UPDATE SET message_count = public.ktrenz_agent_daily_usage.message_count + 1, updated_at = now();
    RETURN jsonb_build_object('allowed', true, 'used', _used + 1, 'daily_limit', _limit, 'tier', _tier, 'point_used', false, 'bonus_remaining', _bonus);
  END IF;

  -- 보너스 잔여량 사용
  IF _bonus > 0 THEN
    UPDATE public.ktrenz_agent_daily_usage
    SET message_count = message_count + 1, bonus_remaining = bonus_remaining - 1, updated_at = now()
    WHERE user_id = _user_id AND usage_date = _today;
    RETURN jsonb_build_object('allowed', true, 'used', _used + 1, 'daily_limit', _limit, 'tier', _tier, 'point_used', true, 'bonus_remaining', _bonus - 1);
  END IF;

  -- 보너스 없음 → 차단
  RETURN jsonb_build_object('allowed', false, 'used', _used, 'daily_limit', _limit, 'tier', _tier, 'reason', 'no_bonus', 'bonus_remaining', 0);
END;
$$;

-- ktrenz_get_agent_usage도 bonus 포함하도록 수정
DROP FUNCTION IF EXISTS public.ktrenz_get_agent_usage(uuid);

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
    (SELECT CASE WHEN ks.tier_id = 3 THEN 'pro' WHEN ks.tier_id = 2 THEN 'basic' ELSE 'free' END
     FROM public.kpass_subscriptions ks WHERE ks.user_id = _user_id AND ks.status = 'active'
     ORDER BY ks.tier_id DESC LIMIT 1), 'free') INTO _tier;

  _limit := CASE _tier WHEN 'pro' THEN 3 WHEN 'basic' THEN 3 ELSE 3 END;

  SELECT COALESCE(au.message_count, 0), COALESCE(au.bonus_remaining, 0)
  INTO _used, _bonus
  FROM public.ktrenz_agent_daily_usage au WHERE au.user_id = _user_id AND au.usage_date = _today;

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