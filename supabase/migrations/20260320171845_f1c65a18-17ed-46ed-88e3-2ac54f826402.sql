UPDATE ktrenz_trend_triggers
SET source_image_url = NULL
WHERE source_url LIKE '%ddaily.co.kr%'
  AND source_image_url IS NOT NULL
  AND source_image_url NOT LIKE '%supabase.co%';