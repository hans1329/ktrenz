
-- 유저 행동 이벤트 추적 테이블
CREATE TABLE public.ktrenz_user_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  event_type TEXT NOT NULL,        -- 'treemap_click', 'list_click', 'modal_category_click', 'artist_detail_view', 'artist_detail_section', 'external_link_click', 'agent_chat', 'agent_mode_switch'
  event_data JSONB DEFAULT '{}',   -- { artist_slug, artist_name, section, category, url, mode, ... }
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 인덱스
CREATE INDEX idx_ktrenz_user_events_user_id ON public.ktrenz_user_events(user_id);
CREATE INDEX idx_ktrenz_user_events_type ON public.ktrenz_user_events(event_type);
CREATE INDEX idx_ktrenz_user_events_created ON public.ktrenz_user_events(created_at DESC);
CREATE INDEX idx_ktrenz_user_events_artist ON public.ktrenz_user_events USING GIN(event_data);

-- RLS
ALTER TABLE public.ktrenz_user_events ENABLE ROW LEVEL SECURITY;

-- 유저는 자기 이벤트만 조회 가능
CREATE POLICY "Users can view own events"
  ON public.ktrenz_user_events FOR SELECT
  USING (auth.uid() = user_id);

-- 유저는 자기 이벤트만 삽입 가능
CREATE POLICY "Users can insert own events"
  ON public.ktrenz_user_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 관리자는 전체 이벤트 조회 가능
CREATE POLICY "Admins can view all events"
  ON public.ktrenz_user_events FOR SELECT
  USING (public.is_admin(auth.uid()));
