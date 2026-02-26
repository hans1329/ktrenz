-- v3_artist_tiers에 표시용 필드 추가
ALTER TABLE public.v3_artist_tiers
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS name_ko text,
  ADD COLUMN IF NOT EXISTS image_url text;

-- display_name을 wiki_entries.title로 초기화
UPDATE public.v3_artist_tiers t
SET display_name = w.title,
    image_url = w.image_url
FROM public.wiki_entries w
WHERE t.wiki_entry_id = w.id
  AND t.display_name IS NULL;