
-- 일일 로그인 보상 함수 (하루 1회만 지급, 10 K-Points)
CREATE OR REPLACE FUNCTION public.ktrenz_daily_login_reward(_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reward_amount integer := 10;
  already_rewarded boolean;
BEGIN
  -- 오늘 이미 보상 받았는지 확인
  SELECT EXISTS (
    SELECT 1 FROM ktrenz_point_transactions
    WHERE user_id = _user_id
      AND reason = 'daily_login'
      AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC')
  ) INTO already_rewarded;

  IF already_rewarded THEN
    RETURN 0;
  END IF;

  -- 포인트 지급 (upsert)
  INSERT INTO ktrenz_user_points (user_id, points, lifetime_points)
  VALUES (_user_id, reward_amount, reward_amount)
  ON CONFLICT (user_id) DO UPDATE SET
    points = ktrenz_user_points.points + reward_amount,
    lifetime_points = ktrenz_user_points.lifetime_points + reward_amount,
    updated_at = now();

  -- 트랜잭션 기록
  INSERT INTO ktrenz_point_transactions (user_id, amount, reason, metadata)
  VALUES (_user_id, reward_amount, 'daily_login', '{"source": "daily_login_reward"}'::jsonb);

  RETURN reward_amount;
END;
$$;
