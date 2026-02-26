
-- 아티스트 마일스톤/신기록 테이블
CREATE TABLE public.v3_artist_milestones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wiki_entry_id UUID NOT NULL REFERENCES public.wiki_entries(id) ON DELETE CASCADE,
  milestone_type TEXT NOT NULL, -- 'top3_ranking', 'tier1_entry', 'top1_ranking', 'highest_score', 'highest_energy', 'highest_buzz'
  milestone_date DATE NOT NULL DEFAULT CURRENT_DATE,
  value NUMERIC, -- 해당 시점의 수치 (점수, 순위 등)
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(wiki_entry_id, milestone_type, milestone_date)
);

-- 인덱스
CREATE INDEX idx_v3_artist_milestones_entry ON public.v3_artist_milestones(wiki_entry_id, milestone_date DESC);

-- RLS
ALTER TABLE public.v3_artist_milestones ENABLE ROW LEVEL SECURITY;

-- 누구나 읽기 가능
CREATE POLICY "Milestones are publicly readable"
  ON public.v3_artist_milestones FOR SELECT USING (true);

-- service role만 쓰기 (edge function에서)
CREATE POLICY "Service role can insert milestones"
  ON public.v3_artist_milestones FOR INSERT
  WITH CHECK (false); -- anon/authenticated 차단, service_role은 RLS bypass
