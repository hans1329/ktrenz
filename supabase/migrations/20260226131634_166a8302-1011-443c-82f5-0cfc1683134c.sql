
-- 포인트 보상 설정 테이블
CREATE TABLE public.ktrenz_point_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reward_type TEXT NOT NULL UNIQUE,
  reward_name TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 10,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID
);

ALTER TABLE public.ktrenz_point_settings ENABLE ROW LEVEL SECURITY;

-- 관리자만 읽기/쓰기
CREATE POLICY "Admins can manage point settings"
  ON public.ktrenz_point_settings FOR ALL
  USING (public.is_admin(auth.uid()));

-- 보상 함수에서 설정값 조회용 (anon도 읽기 가능)
CREATE POLICY "Anyone can read point settings"
  ON public.ktrenz_point_settings FOR SELECT
  USING (true);

-- 기본 데이터: 일일 로그인 보상
INSERT INTO public.ktrenz_point_settings (reward_type, reward_name, points, is_enabled, description)
VALUES ('daily_login', '일일 로그인 보상', 10, true, '매일 첫 로그인 시 지급되는 포인트');

-- daily_login_reward 함수를 설정값 참조하도록 교체
CREATE OR REPLACE FUNCTION public.ktrenz_daily_login_reward(_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _reward_points integer;
  _already boolean;
BEGIN
  -- 설정값에서 포인트 조회 (비활성이면 0 반환)
  SELECT points INTO _reward_points
  FROM ktrenz_point_settings
  WHERE reward_type = 'daily_login' AND is_enabled = true;

  IF _reward_points IS NULL THEN
    RETURN 0;
  END IF;

  -- 오늘 이미 받았는지 확인
  SELECT EXISTS(
    SELECT 1 FROM ktrenz_point_transactions
    WHERE user_id = _user_id
      AND reason = 'daily_login'
      AND created_at >= (now() AT TIME ZONE 'UTC')::date
  ) INTO _already;

  IF _already THEN
    RETURN 0;
  END IF;

  -- 포인트 지급
  INSERT INTO ktrenz_user_points (user_id, points, lifetime_points)
  VALUES (_user_id, _reward_points, _reward_points)
  ON CONFLICT (user_id) DO UPDATE
    SET points = ktrenz_user_points.points + _reward_points,
        lifetime_points = ktrenz_user_points.lifetime_points + _reward_points,
        updated_at = now();

  INSERT INTO ktrenz_point_transactions (user_id, amount, reason, description)
  VALUES (_user_id, _reward_points, 'daily_login', '일일 로그인 보상');

  RETURN _reward_points;
END;
$$;
