
-- total_score generated column에 album_sales_score 포함
ALTER TABLE public.v3_scores DROP COLUMN total_score;
ALTER TABLE public.v3_scores ADD COLUMN total_score numeric GENERATED ALWAYS AS (
  COALESCE(youtube_score, 0) + COALESCE(spotify_score, 0) + COALESCE(twitter_score, 0) + COALESCE(tiktok_score, 0) + COALESCE(album_sales_score, 0)
) STORED;
