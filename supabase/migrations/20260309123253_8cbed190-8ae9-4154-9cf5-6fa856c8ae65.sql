-- Add missing columns to ktrenz_external_video_matches for metrics tracking
ALTER TABLE public.ktrenz_external_video_matches
  ADD COLUMN IF NOT EXISTS comment_count bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS like_count bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'variety';

-- Add unique constraint for upsert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ktrenz_external_video_matches_channel_video_artist_unique'
  ) THEN
    ALTER TABLE public.ktrenz_external_video_matches
      ADD CONSTRAINT ktrenz_external_video_matches_channel_video_artist_unique
      UNIQUE (channel_id, video_id, wiki_entry_id);
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Constraint may already exist or duplicate key issue: %', SQLERRM;
END $$;