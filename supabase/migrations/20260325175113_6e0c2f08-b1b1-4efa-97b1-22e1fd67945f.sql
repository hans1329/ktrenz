-- Add star_id column to ktrenz_watched_artists
ALTER TABLE public.ktrenz_watched_artists
  ADD COLUMN star_id uuid REFERENCES public.ktrenz_stars(id) ON DELETE CASCADE;

-- Create index for efficient lookup
CREATE INDEX idx_ktrenz_watched_artists_star_id ON public.ktrenz_watched_artists(star_id) WHERE star_id IS NOT NULL;

-- Create unique constraint on (user_id, star_id) to prevent duplicates
CREATE UNIQUE INDEX uq_ktrenz_watched_artists_user_star ON public.ktrenz_watched_artists(user_id, star_id) WHERE star_id IS NOT NULL;

-- Backfill: populate star_id from existing wiki_entry_id data
UPDATE public.ktrenz_watched_artists wa
SET star_id = s.id
FROM public.ktrenz_stars s
WHERE wa.wiki_entry_id = s.wiki_entry_id
  AND wa.star_id IS NULL;