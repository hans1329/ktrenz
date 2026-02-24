
-- total_score가 twitter_score에 의존하므로 먼저 total_score를 드롭
ALTER TABLE public.v3_scores DROP COLUMN total_score;

-- twitter_score 제거
ALTER TABLE public.v3_scores DROP COLUMN twitter_score;

-- 정규화 + 가중합 total_score 재생성 (max 10,000)
ALTER TABLE public.v3_scores ADD COLUMN total_score numeric GENERATED ALWAYS AS (
  LEAST(COALESCE(youtube_score, 0)::numeric / 310, 100) * 30 +
  LEAST(COALESCE(buzz_score, 0)::numeric / 15, 100) * 25 +
  LEAST(COALESCE(album_sales_score, 0)::numeric / 40, 100) * 25 +
  LEAST(COALESCE(music_score, 0)::numeric / 2, 100) * 20
) STORED;
