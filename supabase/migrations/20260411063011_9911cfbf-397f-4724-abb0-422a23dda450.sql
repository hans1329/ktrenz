
-- 1. ktrenz_b2_batch_queue에 pair_index, side 추가
ALTER TABLE public.ktrenz_b2_batch_queue
  ADD COLUMN IF NOT EXISTS pair_index integer,
  ADD COLUMN IF NOT EXISTS side text;

-- 2. ktrenz_b2_runs에 batch_id, search_round 추가
ALTER TABLE public.ktrenz_b2_runs
  ADD COLUMN IF NOT EXISTS batch_id text,
  ADD COLUMN IF NOT EXISTS search_round integer DEFAULT 1;

-- 인덱스: batch_id + search_round로 빠른 조회
CREATE INDEX IF NOT EXISTS idx_b2_runs_batch_round
  ON public.ktrenz_b2_runs (batch_id, search_round);

-- 3. ktrenz_b2_battles 테이블 신설
CREATE TABLE IF NOT EXISTS public.ktrenz_b2_battles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_date date NOT NULL,
  batch_id text NOT NULL,
  status text NOT NULL DEFAULT 'collecting',
  betting_opens_at timestamptz,
  betting_closes_at timestamptz,
  settled_at timestamptz,
  total_pairs integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_b2_battles_date UNIQUE (battle_date)
);

-- RLS
ALTER TABLE public.ktrenz_b2_battles ENABLE ROW LEVEL SECURITY;

-- 인증 사용자 조회 허용
CREATE POLICY "Authenticated users can view battles"
  ON public.ktrenz_b2_battles
  FOR SELECT
  TO authenticated
  USING (true);

-- 비인증 사용자도 조회 가능 (배틀 상태 확인용)
CREATE POLICY "Public can view battles"
  ON public.ktrenz_b2_battles
  FOR SELECT
  TO anon
  USING (true);
