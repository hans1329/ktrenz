
ALTER TABLE public.v3_artist_tiers
  ADD COLUMN IF NOT EXISTS youtube_channel_id text,
  ADD COLUMN IF NOT EXISTS spotify_artist_id text,
  ADD COLUMN IF NOT EXISTS lastfm_artist_name text,
  ADD COLUMN IF NOT EXISTS deezer_artist_id text,
  ADD COLUMN IF NOT EXISTS x_handle text,
  ADD COLUMN IF NOT EXISTS instagram_handle text,
  ADD COLUMN IF NOT EXISTS tiktok_handle text;

COMMENT ON COLUMN public.v3_artist_tiers.youtube_channel_id IS 'YouTube 채널 ID (UC...)';
COMMENT ON COLUMN public.v3_artist_tiers.spotify_artist_id IS 'Spotify 아티스트 ID';
COMMENT ON COLUMN public.v3_artist_tiers.lastfm_artist_name IS 'Last.fm 아티스트명';
COMMENT ON COLUMN public.v3_artist_tiers.deezer_artist_id IS 'Deezer 아티스트 ID';
COMMENT ON COLUMN public.v3_artist_tiers.x_handle IS 'X(Twitter) 핸들 (@제외)';
COMMENT ON COLUMN public.v3_artist_tiers.instagram_handle IS 'Instagram 핸들 (@제외)';
COMMENT ON COLUMN public.v3_artist_tiers.tiktok_handle IS 'TikTok 핸들 (@제외)';
