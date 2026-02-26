-- v3_artist_tiers에 최신 YouTube 영상 ID 저장 컬럼 추가
ALTER TABLE public.v3_artist_tiers
ADD COLUMN IF NOT EXISTS latest_youtube_video_id TEXT,
ADD COLUMN IF NOT EXISTS latest_youtube_video_title TEXT,
ADD COLUMN IF NOT EXISTS latest_youtube_updated_at TIMESTAMPTZ;