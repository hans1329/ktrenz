
-- spotify_score를 total_score 계산에서 제거 (tiktok_score도 항상 0이므로 함께 제거)
ALTER TABLE public.v3_scores DROP COLUMN total_score;
ALTER TABLE public.v3_scores ADD COLUMN total_score numeric GENERATED ALWAYS AS (
  COALESCE(youtube_score, 0) + 
  COALESCE(twitter_score, 0) + 
  COALESCE(album_sales_score, 0) + 
  COALESCE(music_score, 0) +
  COALESCE(buzz_score, 0)
) STORED;
