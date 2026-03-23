
-- TikTok/Instagram 소셜 트렌드 데이터 저장 테이블
CREATE TABLE public.ktrenz_social_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  star_id uuid NOT NULL REFERENCES public.ktrenz_stars(id) ON DELETE CASCADE,
  wiki_entry_id uuid NOT NULL,
  platform text NOT NULL DEFAULT 'tiktok',
  keyword text NOT NULL,
  keyword_type text NOT NULL DEFAULT 'search',
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  top_posts jsonb DEFAULT '[]'::jsonb,
  collected_at timestamptz NOT NULL DEFAULT now()
);

-- 인덱스
CREATE INDEX idx_social_snapshots_star ON public.ktrenz_social_snapshots(star_id);
CREATE INDEX idx_social_snapshots_wiki ON public.ktrenz_social_snapshots(wiki_entry_id);
CREATE INDEX idx_social_snapshots_platform ON public.ktrenz_social_snapshots(platform, collected_at DESC);
CREATE INDEX idx_social_snapshots_collected ON public.ktrenz_social_snapshots(collected_at DESC);

-- RLS
ALTER TABLE public.ktrenz_social_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON public.ktrenz_social_snapshots FOR SELECT USING (true);
CREATE POLICY "Allow service insert" ON public.ktrenz_social_snapshots FOR INSERT WITH CHECK (true);
