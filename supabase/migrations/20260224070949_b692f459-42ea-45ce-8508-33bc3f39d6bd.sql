
-- K-Pass 등급 정의 테이블
CREATE TABLE public.kpass_tiers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  name_ko TEXT NOT NULL,
  description TEXT,
  monthly_price_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  features JSONB DEFAULT '[]'::jsonb,
  color TEXT,
  icon TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.kpass_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active tiers"
ON public.kpass_tiers FOR SELECT
USING (is_active = true);

-- 기본 5등급 데이터 삽입
INSERT INTO public.kpass_tiers (id, name, name_ko, monthly_price_usd, color, icon, sort_order) VALUES
(1, 'Free', '프리', 0, '#94a3b8', '🎵', 1),
(2, 'Basic', '베이직', 4.99, '#60a5fa', '🎤', 2),
(3, 'Pro', '프로', 9.99, '#a78bfa', '🎸', 3),
(4, 'Premium', '프리미엄', 19.99, '#f59e0b', '👑', 4),
(5, 'VIP', 'VIP', 49.99, '#ef4444', '💎', 5);

-- 유저별 K-Pass 구독 테이블
CREATE TABLE public.kpass_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tier_id INT NOT NULL REFERENCES public.kpass_tiers(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired', 'pending')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.kpass_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription"
ON public.kpass_subscriptions FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own subscription"
ON public.kpass_subscriptions FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own subscription"
ON public.kpass_subscriptions FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- 가입 시 자동으로 Free 패스 부여하는 함수
CREATE OR REPLACE FUNCTION public.auto_assign_free_kpass()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.kpass_subscriptions (user_id, tier_id, status)
  VALUES (NEW.id, 1, 'active')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

-- profiles 테이블에 새 유저 생성 시 트리거 (profiles는 기존 ktrendz에서 이미 존재)
-- 대신 auth.users에서 직접 트리거
CREATE TRIGGER on_auth_user_created_kpass
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.auto_assign_free_kpass();
