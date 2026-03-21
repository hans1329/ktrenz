
-- 파이프라인 실행 상태를 DB에 기록하는 테이블
CREATE TABLE public.ktrenz_pipeline_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id TEXT NOT NULL,
  phase TEXT NOT NULL, -- detect, detect_global, detect_youtube, track
  status TEXT NOT NULL DEFAULT 'running', -- running, completed, postprocess_requested, postprocess_running, done, failed
  current_offset INT NOT NULL DEFAULT 0,
  batch_size INT NOT NULL DEFAULT 5,
  total_candidates INT,
  postprocess_done BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pipeline_state_run_phase ON public.ktrenz_pipeline_state(run_id, phase);
CREATE INDEX idx_pipeline_state_status ON public.ktrenz_pipeline_state(status);

ALTER TABLE public.ktrenz_pipeline_state ENABLE ROW LEVEL SECURITY;

-- 어드민만 조회 가능 (서비스 롤 키로 접근)
CREATE POLICY "Service role full access" ON public.ktrenz_pipeline_state
  FOR ALL USING (true) WITH CHECK (true);
