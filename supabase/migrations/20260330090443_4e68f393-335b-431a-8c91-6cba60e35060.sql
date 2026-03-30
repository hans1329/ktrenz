-- ktrenz_trend_tracking에 소스별 raw 값 컬럼 추가
-- 각 소스의 원본 측정값을 저장하여 다음 주기 delta 계산에 사용
ALTER TABLE ktrenz_trend_tracking
  ADD COLUMN IF NOT EXISTS naver_news_total integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS naver_blog_total integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS naver_news_24h integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS naver_blog_24h integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS datalab_ratio real DEFAULT 0,
  ADD COLUMN IF NOT EXISTS datalab_trend_7d real[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS youtube_video_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS youtube_total_views bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS youtube_total_comments integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tiktok_video_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tiktok_total_views bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tiktok_total_likes integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tiktok_total_comments integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS insta_post_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS insta_total_likes integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS insta_total_comments integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_scores jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS weighted_delta real DEFAULT 0;

-- ktrenz_keywords에 소스별 baseline/peak raw 값 저장
ALTER TABLE ktrenz_keywords
  ADD COLUMN IF NOT EXISTS baseline_raw jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS peak_raw jsonb DEFAULT '{}';