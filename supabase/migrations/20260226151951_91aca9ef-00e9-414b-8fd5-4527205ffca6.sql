-- v3_artist_tiers에 YouTube Topic 채널 ID 컬럼 추가
ALTER TABLE public.v3_artist_tiers
ADD COLUMN IF NOT EXISTS youtube_topic_channel_id TEXT DEFAULT NULL;