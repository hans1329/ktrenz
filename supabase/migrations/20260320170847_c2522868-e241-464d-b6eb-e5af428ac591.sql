UPDATE ktrenz_trend_triggers
SET source_image_url = 'https://www.ddaily.co.kr' || source_image_url
WHERE source_image_url IS NOT NULL
  AND source_image_url NOT LIKE 'http%'
  AND source_image_url LIKE '/%';