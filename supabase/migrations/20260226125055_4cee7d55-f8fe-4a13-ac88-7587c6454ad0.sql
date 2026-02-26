
-- ktrenz 전용 포인트 시스템 (k-trendz.com과 독립)
CREATE TABLE public.ktrenz_user_points (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  lifetime_points INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- 포인트 변동 이력
CREATE TABLE public.ktrenz_point_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  metadata JSONB DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS 활성화
ALTER TABLE public.ktrenz_user_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ktrenz_point_transactions ENABLE ROW LEVEL SECURITY;

-- 본인만 조회 가능
CREATE POLICY "Users can view own points" ON public.ktrenz_user_points
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own point transactions" ON public.ktrenz_point_transactions
  FOR SELECT USING (auth.uid() = user_id);

-- 관리자는 모든 데이터 접근 가능 (is_admin RPC 사용)
CREATE POLICY "Admins can manage all points" ON public.ktrenz_user_points
  FOR ALL USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can manage all point transactions" ON public.ktrenz_point_transactions
  FOR ALL USING (public.is_admin(auth.uid()));

-- updated_at 자동 업데이트 트리거
CREATE TRIGGER update_ktrenz_user_points_updated_at
  BEFORE UPDATE ON public.ktrenz_user_points
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 인덱스
CREATE INDEX idx_ktrenz_point_transactions_user_id ON public.ktrenz_point_transactions(user_id);
CREATE INDEX idx_ktrenz_point_transactions_created_at ON public.ktrenz_point_transactions(created_at DESC);
