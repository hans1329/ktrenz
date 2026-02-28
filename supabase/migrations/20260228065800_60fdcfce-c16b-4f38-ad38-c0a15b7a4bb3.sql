-- v3_energy_snapshots_v2에 카테고리별 점수 컬럼 추가 (24h 변동률 계산용)
ALTER TABLE public.v3_energy_snapshots_v2
  ADD COLUMN IF NOT EXISTS youtube_score numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS buzz_score numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS album_score numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS music_score numeric DEFAULT 0;