-- 데이터 엔진 실행 추적 테이블
CREATE TABLE public.ktrenz_engine_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'running',
  trigger_source TEXT DEFAULT 'manual',
  modules_requested TEXT[] DEFAULT '{}',
  current_module TEXT,
  results JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  error_message TEXT
);

ALTER TABLE public.ktrenz_engine_runs ENABLE ROW LEVEL SECURITY;

-- 서비스 롤만 접근 가능 (edge function에서 사용)
-- RLS 정책 없음 = anon/authenticated 접근 불가 (의도적)