
-- KTrenZ 로그인 이력 테이블
CREATE TABLE public.ktrenz_user_logins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  first_login_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz NOT NULL DEFAULT now(),
  login_count int NOT NULL DEFAULT 1,
  UNIQUE(user_id)
);

ALTER TABLE public.ktrenz_user_logins ENABLE ROW LEVEL SECURITY;

-- 본인 조회 가능
CREATE POLICY "Users can view own login"
  ON public.ktrenz_user_logins FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 관리자 전체 조회
CREATE POLICY "Admins can view all logins"
  ON public.ktrenz_user_logins FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 본인 upsert 가능
CREATE POLICY "Users can upsert own login"
  ON public.ktrenz_user_logins FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own login"
  ON public.ktrenz_user_logins FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);
