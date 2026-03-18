UPDATE ktrenz_trend_triggers
SET source_image_url = 'https://cdn.slist.kr/news/photo/202306/459636_738767_2855.jpg'
WHERE id = '0b13c3b3-7a9d-4505-b331-cde896eeb4a2'
  AND (source_image_url IS NULL OR source_image_url = '');