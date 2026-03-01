
-- 유저별 일일 데이터 런 사용량 추적
CREATE TABLE public.ktrenz_data_run_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  wiki_entry_id UUID NOT NULL,
  module TEXT NOT NULL, -- 'youtube', 'buzz', 'music', 'album', 'all'
  run_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ktrenz_data_run_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own usage"
  ON public.ktrenz_data_run_usage FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own usage"
  ON public.ktrenz_data_run_usage FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 빠른 조회를 위한 인덱스
CREATE INDEX idx_data_run_usage_user_date ON public.ktrenz_data_run_usage (user_id, run_date);
