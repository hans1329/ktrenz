
-- Add image_url column directly to ktrenz_stars for members without wiki_entries
ALTER TABLE public.ktrenz_stars ADD COLUMN IF NOT EXISTS image_url text;

-- Add comment
COMMENT ON COLUMN public.ktrenz_stars.image_url IS 'Auto-crawled profile image URL for stars without wiki_entry_id';
