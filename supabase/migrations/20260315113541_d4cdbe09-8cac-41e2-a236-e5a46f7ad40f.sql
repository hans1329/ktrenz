-- One-time fix: sync broken v3_artist_tiers.image_url with wiki_entries.image_url
-- Many tier rows have .jpg URLs that are 404 (actual files are .webp)
UPDATE v3_artist_tiers t
SET image_url = w.image_url
FROM wiki_entries w
WHERE w.id = t.wiki_entry_id
  AND w.image_url IS NOT NULL
  AND t.image_url IS NOT NULL
  AND t.image_url != w.image_url
  AND t.image_url LIKE '%.jpg'
  AND w.image_url LIKE '%.webp';