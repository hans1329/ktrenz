UPDATE ktrenz_trend_triggers
SET source_image_url = REPLACE(source_image_url, '&amp;', '&')
WHERE source_image_url LIKE '%&amp;%';