
-- 아티스트 마일스톤 이벤트 테이블 (빌보드 첫 진입 등 스페셜 이벤트)
CREATE TABLE public.ktrenz_milestone_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wiki_entry_id UUID NOT NULL,
  event_type TEXT NOT NULL, -- 'billboard_first_entry', 'apple_music_top10', etc.
  event_data JSONB DEFAULT '{}'::jsonb,
  notified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_milestone_events_wiki ON public.ktrenz_milestone_events(wiki_entry_id, event_type);
CREATE INDEX idx_milestone_events_notified ON public.ktrenz_milestone_events(notified) WHERE notified = false;

ALTER TABLE public.ktrenz_milestone_events ENABLE ROW LEVEL SECURITY;

-- 인증된 사용자만 읽기 가능
CREATE POLICY "Authenticated users can read milestone events"
  ON public.ktrenz_milestone_events
  FOR SELECT
  TO authenticated
  USING (true);
