
-- 팬 기여도 집계 테이블 (외부 링크 클릭 기반)
CREATE TABLE public.ktrenz_fan_contributions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  wiki_entry_id UUID NOT NULL REFERENCES public.wiki_entries(id),
  platform TEXT NOT NULL, -- youtube, twitter, news, tiktok, naver, other
  click_count INTEGER NOT NULL DEFAULT 0,
  weighted_score NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, wiki_entry_id, platform)
);

ALTER TABLE public.ktrenz_fan_contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all contributions" ON public.ktrenz_fan_contributions
  FOR SELECT USING (true);

CREATE POLICY "Users can insert own contributions" ON public.ktrenz_fan_contributions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own contributions" ON public.ktrenz_fan_contributions
  FOR UPDATE USING (auth.uid() = user_id);

-- 빠른 조회를 위한 인덱스
CREATE INDEX idx_fan_contributions_user ON public.ktrenz_fan_contributions(user_id);
CREATE INDEX idx_fan_contributions_entry ON public.ktrenz_fan_contributions(wiki_entry_id);
CREATE INDEX idx_fan_contributions_score ON public.ktrenz_fan_contributions(wiki_entry_id, weighted_score DESC);

-- 기여도 기록 RPC (upsert + 가중치 자동 계산)
CREATE OR REPLACE FUNCTION public.ktrenz_record_contribution(
  _user_id UUID,
  _wiki_entry_id UUID,
  _platform TEXT
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _weight NUMERIC;
BEGIN
  _weight := CASE _platform
    WHEN 'youtube' THEN 1.5
    WHEN 'twitter' THEN 1.5
    WHEN 'news' THEN 2.0
    WHEN 'tiktok' THEN 1.4
    WHEN 'naver' THEN 1.3
    WHEN 'spotify' THEN 1.2
    WHEN 'melon' THEN 1.2
    ELSE 1.0
  END;

  INSERT INTO public.ktrenz_fan_contributions (user_id, wiki_entry_id, platform, click_count, weighted_score)
  VALUES (_user_id, _wiki_entry_id, _platform, 1, _weight)
  ON CONFLICT (user_id, wiki_entry_id, platform)
  DO UPDATE SET
    click_count = ktrenz_fan_contributions.click_count + 1,
    weighted_score = ktrenz_fan_contributions.weighted_score + _weight,
    updated_at = now();
END;
$$;
