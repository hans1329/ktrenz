-- Sync: copy v3_artist_tiers.image_url to wiki_entries.image_url where wiki is null
UPDATE wiki_entries w
SET image_url = t.image_url
FROM v3_artist_tiers t
WHERE t.wiki_entry_id = w.id
  AND w.image_url IS NULL
  AND t.image_url IS NOT NULL;