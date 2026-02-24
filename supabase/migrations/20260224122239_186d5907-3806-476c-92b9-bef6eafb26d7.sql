
-- music_score 컬럼 추가
ALTER TABLE public.v3_scores 
  ADD COLUMN IF NOT EXISTS music_score integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS music_data jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS music_updated_at timestamptz;

-- total_score generated 컬럼 재생성 (music_score 포함)
ALTER TABLE public.v3_scores DROP COLUMN total_score;
ALTER TABLE public.v3_scores ADD COLUMN total_score numeric GENERATED ALWAYS AS (
  COALESCE(youtube_score, 0) + COALESCE(spotify_score, 0) + 
  COALESCE(twitter_score, 0) + COALESCE(tiktok_score, 0) + 
  COALESCE(album_sales_score, 0) + COALESCE(music_score, 0)
) STORED;
