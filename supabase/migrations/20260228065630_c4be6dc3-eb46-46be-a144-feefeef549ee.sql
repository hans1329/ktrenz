-- v3_scores_v2에 카테고리별 24h 변동률 컬럼 추가
ALTER TABLE public.v3_scores_v2
  ADD COLUMN IF NOT EXISTS youtube_change_24h numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS buzz_change_24h numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS album_change_24h numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS music_change_24h numeric DEFAULT 0;