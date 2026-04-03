
-- Copy wiki_entries.image_url into ktrenz_stars.image_url
-- for stars that have wiki_entry_id but no image_url yet
UPDATE public.ktrenz_stars s
SET image_url = w.image_url
FROM public.wiki_entries w
WHERE s.wiki_entry_id = w.id
  AND w.image_url IS NOT NULL
  AND (s.image_url IS NULL OR s.image_url = '');
