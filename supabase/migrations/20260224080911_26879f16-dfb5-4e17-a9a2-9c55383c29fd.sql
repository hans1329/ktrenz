
-- 관심 아티스트 추적 테이블
CREATE TABLE public.ktrenz_watched_artists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  artist_name TEXT NOT NULL,
  wiki_entry_id UUID REFERENCES public.wiki_entries(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 유저별 아티스트 중복 방지
CREATE UNIQUE INDEX idx_ktrenz_watched_unique ON public.ktrenz_watched_artists (user_id, LOWER(artist_name));

-- RLS
ALTER TABLE public.ktrenz_watched_artists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own watched artists"
  ON public.ktrenz_watched_artists FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own watched artists"
  ON public.ktrenz_watched_artists FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own watched artists"
  ON public.ktrenz_watched_artists FOR DELETE
  USING (auth.uid() = user_id);
