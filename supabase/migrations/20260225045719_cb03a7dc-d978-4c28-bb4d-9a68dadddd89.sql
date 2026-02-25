
-- 아티스트 티어 분류 테이블
-- tier 1 = 분석/노출 대상 (상위 50명)
-- tier 2 = 비노출/비분석 대상
CREATE TABLE public.v3_artist_tiers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wiki_entry_id UUID NOT NULL REFERENCES public.wiki_entries(id) ON DELETE CASCADE,
  tier INTEGER NOT NULL DEFAULT 2 CHECK (tier IN (1, 2)),
  is_manual_override BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT v3_artist_tiers_wiki_entry_id_key UNIQUE (wiki_entry_id)
);

-- 인덱스
CREATE INDEX idx_v3_artist_tiers_tier ON public.v3_artist_tiers(tier);
CREATE INDEX idx_v3_artist_tiers_wiki_entry_id ON public.v3_artist_tiers(wiki_entry_id);

-- RLS
ALTER TABLE public.v3_artist_tiers ENABLE ROW LEVEL SECURITY;

-- 누구나 읽기 가능 (공개 랭킹 데이터)
CREATE POLICY "Anyone can read artist tiers"
  ON public.v3_artist_tiers FOR SELECT
  USING (true);

-- 관리자만 수정 가능
CREATE POLICY "Admins can manage artist tiers"
  ON public.v3_artist_tiers FOR ALL
  USING (public.is_admin(auth.uid()));

-- updated_at 자동 갱신
CREATE TRIGGER update_v3_artist_tiers_updated_at
  BEFORE UPDATE ON public.v3_artist_tiers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 기존 v3_scores_v2의 상위 50명을 tier 1로 초기 설정
INSERT INTO public.v3_artist_tiers (wiki_entry_id, tier, is_manual_override)
SELECT wiki_entry_id, 
  CASE WHEN rn <= 50 THEN 1 ELSE 2 END,
  false
FROM (
  SELECT wiki_entry_id, 
    ROW_NUMBER() OVER (ORDER BY total_score DESC) as rn
  FROM public.v3_scores_v2
  WHERE wiki_entry_id IS NOT NULL
) ranked
ON CONFLICT (wiki_entry_id) DO NOTHING;
