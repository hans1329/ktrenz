
-- Daily agent usage tracking
CREATE TABLE public.ktrenz_agent_daily_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date date NOT NULL DEFAULT CURRENT_DATE,
  message_count int NOT NULL DEFAULT 0,
  points_spent int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, usage_date)
);

ALTER TABLE public.ktrenz_agent_daily_usage ENABLE ROW LEVEL SECURITY;

-- Users can read their own usage
CREATE POLICY "Users can read own agent usage"
  ON public.ktrenz_agent_daily_usage
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Function to check & increment agent usage, returns remaining free messages or -1 if needs points
CREATE OR REPLACE FUNCTION public.ktrenz_check_agent_usage(
  _user_id uuid,
  _cost_per_message int DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _daily_limit int := 30;
  _tier_name text;
  _current_count int;
  _points int;
  _result jsonb;
BEGIN
  -- Get K-Pass tier for daily limit
  SELECT t.name INTO _tier_name
  FROM kpass_subscriptions s
  JOIN kpass_tiers t ON t.id = s.tier_id
  WHERE s.user_id = _user_id
    AND s.status = 'active'
    AND (s.expires_at IS NULL OR s.expires_at > now())
  ORDER BY t.sort_order DESC
  LIMIT 1;

  -- Set daily limit based on tier
  _daily_limit := CASE
    WHEN _tier_name = 'Pro' THEN 100
    WHEN _tier_name = 'Basic' THEN 50
    ELSE 30  -- Free tier
  END;

  -- Upsert today's usage and get current count
  INSERT INTO ktrenz_agent_daily_usage (user_id, usage_date, message_count)
  VALUES (_user_id, CURRENT_DATE, 0)
  ON CONFLICT (user_id, usage_date) DO NOTHING;

  SELECT message_count INTO _current_count
  FROM ktrenz_agent_daily_usage
  WHERE user_id = _user_id AND usage_date = CURRENT_DATE;

  -- Check if within free limit
  IF _current_count < _daily_limit THEN
    -- Increment and return OK
    UPDATE ktrenz_agent_daily_usage
    SET message_count = message_count + 1, updated_at = now()
    WHERE user_id = _user_id AND usage_date = CURRENT_DATE;

    _result := jsonb_build_object(
      'allowed', true,
      'used', _current_count + 1,
      'daily_limit', _daily_limit,
      'remaining', _daily_limit - _current_count - 1,
      'points_charged', 0,
      'tier', COALESCE(_tier_name, 'Free')
    );
  ELSE
    -- Over limit: check points
    SELECT COALESCE(SUM(amount), 0) INTO _points
    FROM ktrenz_point_transactions
    WHERE user_id = _user_id;

    IF _points >= _cost_per_message THEN
      -- Deduct points and allow
      INSERT INTO ktrenz_point_transactions (user_id, amount, description)
      VALUES (_user_id, -_cost_per_message, 'Fan Agent 추가 메시지');

      UPDATE ktrenz_agent_daily_usage
      SET message_count = message_count + 1, points_spent = points_spent + _cost_per_message, updated_at = now()
      WHERE user_id = _user_id AND usage_date = CURRENT_DATE;

      _result := jsonb_build_object(
        'allowed', true,
        'used', _current_count + 1,
        'daily_limit', _daily_limit,
        'remaining', 0,
        'points_charged', _cost_per_message,
        'points_remaining', _points - _cost_per_message,
        'tier', COALESCE(_tier_name, 'Free')
      );
    ELSE
      -- Not enough points
      _result := jsonb_build_object(
        'allowed', false,
        'used', _current_count,
        'daily_limit', _daily_limit,
        'remaining', 0,
        'points_remaining', _points,
        'points_needed', _cost_per_message,
        'tier', COALESCE(_tier_name, 'Free')
      );
    END IF;
  END IF;

  RETURN _result;
END;
$$;

-- Function to get current usage (read-only, for UI display)
CREATE OR REPLACE FUNCTION public.ktrenz_get_agent_usage(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _daily_limit int := 30;
  _tier_name text;
  _current_count int;
BEGIN
  SELECT t.name INTO _tier_name
  FROM kpass_subscriptions s
  JOIN kpass_tiers t ON t.id = s.tier_id
  WHERE s.user_id = _user_id
    AND s.status = 'active'
    AND (s.expires_at IS NULL OR s.expires_at > now())
  ORDER BY t.sort_order DESC
  LIMIT 1;

  _daily_limit := CASE
    WHEN _tier_name = 'Pro' THEN 100
    WHEN _tier_name = 'Basic' THEN 50
    ELSE 30
  END;

  SELECT COALESCE(message_count, 0) INTO _current_count
  FROM ktrenz_agent_daily_usage
  WHERE user_id = _user_id AND usage_date = CURRENT_DATE;

  IF _current_count IS NULL THEN _current_count := 0; END IF;

  RETURN jsonb_build_object(
    'used', _current_count,
    'daily_limit', _daily_limit,
    'remaining', GREATEST(0, _daily_limit - _current_count),
    'tier', COALESCE(_tier_name, 'Free')
  );
END;
$$;
