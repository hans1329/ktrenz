UPDATE v3_artist_tiers SET melon_artist_name = CASE wiki_entry_id
  WHEN 'a6010a51-badf-41ea-8c6c-424a4726b18e' THEN 'NMIXX'
  WHEN '7797215c-8cc1-48ad-9437-cc424007e3ed' THEN 'OH MY GIRL (오마이걸)'
  WHEN '4e816f60-611a-4ee8-90d3-50a5495ed231' THEN 'ONEUS (원어스)'
  WHEN '15d05a52-30fe-43a0-b5d7-29438cf28f11' THEN 'ONF (온앤오프)'
  WHEN '6a2ee852-af91-496a-a17c-99fdbebff932' THEN 'P1Harmony (피원하모니)'
  WHEN '60da0c92-c75b-4a51-966f-f4948b591609' THEN 'PLAVE (플레이브)'
  WHEN 'eed3c2ef-e905-493e-be8b-ae8a9f49559f' THEN 'PRISTIN (프리스틴)'
  WHEN 'e4eab2c6-f9ba-45fe-a7ee-b33c5d27a8ac' THEN 'Red Velvet (레드벨벳)'
  WHEN '6e84ae8f-0aab-4ced-a0a4-a67ee561f110' THEN 'RIIZE (라이즈)'
  WHEN 'c71570dc-12f6-40dc-9e7e-7c2211fb3c7b' THEN 'SEVENTEEN (세븐틴)'
  WHEN '66931c83-603a-40a0-81fd-de14271b0cf2' THEN 'SHINee (샤이니)'
  WHEN 'e9cd8d81-1eed-4552-a363-7d4650e5c2e2' THEN 'STAYC (스테이씨)'
  WHEN 'f3417a3a-77a5-4df0-92cf-274ee09a0120' THEN 'Stray Kids (스트레이 키즈)'
  WHEN '3b66b5d5-acaf-40e4-ac5b-045f8c57f4aa' THEN 'TEMPEST (템페스트)'
  WHEN 'a9c9f17e-6ff8-4fd8-8a55-44d106147932' THEN 'THE BOYZ (더보이즈)'
  WHEN 'e10ecde0-b3b5-4dc6-9d90-4661326bca01' THEN 'TREASURE (트레저)'
  WHEN '692f2271-ef46-444d-aef3-bf48d312b914' THEN '동방신기 (TVXQ!)'
  WHEN '7ef853da-d702-4387-8a1e-6590b128a950' THEN 'TWICE (트와이스)'
  WHEN 'd29bd9c1-e56c-4cf4-ab67-eed0e2b65767' THEN 'TWS (투어스)'
  WHEN '773a2694-cb18-4046-ae3c-e98a4ccb3347' THEN 'TOMORROW X TOGETHER'
  WHEN '9fcd754e-c6f9-4949-82fa-27d308942b37' THEN 'Wanna One (워너원)'
  WHEN '1306bb97-edb0-4452-873d-6bb75b5470b4' THEN 'WayV (웨이브이)'
  WHEN 'db97502e-78d8-46d5-b3e4-1b03445a863e' THEN 'WINNER (위너)'
  WHEN 'd3c41f78-c6c4-4d5a-876c-9ad62a54d09c' THEN '원더걸스 (Wonder Girls)'
  WHEN 'e1e72f28-2be4-47a9-ab49-52f304d3f7bc' THEN 'XG'
  WHEN 'e7c61789-619c-4cc1-9a30-2e6e3298b32e' THEN 'ZEROBASEONE (제로베이스원)'
  WHEN 'bf0d0292-12ae-4866-9010-950632cdfa47' THEN 'Cortis'
  WHEN '0b1db6b4-5552-4f7e-bf0d-11ee0fde6a06' THEN 'D1CE (디원스)'
  WHEN '96679092-ad41-4f70-ba1f-9756ce18fb00' THEN 'H.O.T.'
END
WHERE wiki_entry_id IN (
  'a6010a51-badf-41ea-8c6c-424a4726b18e','7797215c-8cc1-48ad-9437-cc424007e3ed',
  '4e816f60-611a-4ee8-90d3-50a5495ed231','15d05a52-30fe-43a0-b5d7-29438cf28f11',
  '6a2ee852-af91-496a-a17c-99fdbebff932','60da0c92-c75b-4a51-966f-f4948b591609',
  'eed3c2ef-e905-493e-be8b-ae8a9f49559f','e4eab2c6-f9ba-45fe-a7ee-b33c5d27a8ac',
  '6e84ae8f-0aab-4ced-a0a4-a67ee561f110','c71570dc-12f6-40dc-9e7e-7c2211fb3c7b',
  '66931c83-603a-40a0-81fd-de14271b0cf2','e9cd8d81-1eed-4552-a363-7d4650e5c2e2',
  'f3417a3a-77a5-4df0-92cf-274ee09a0120','3b66b5d5-acaf-40e4-ac5b-045f8c57f4aa',
  'a9c9f17e-6ff8-4fd8-8a55-44d106147932','e10ecde0-b3b5-4dc6-9d90-4661326bca01',
  '692f2271-ef46-444d-aef3-bf48d312b914','7ef853da-d702-4387-8a1e-6590b128a950',
  'd29bd9c1-e56c-4cf4-ab67-eed0e2b65767','773a2694-cb18-4046-ae3c-e98a4ccb3347',
  '9fcd754e-c6f9-4949-82fa-27d308942b37','1306bb97-edb0-4452-873d-6bb75b5470b4',
  'db97502e-78d8-46d5-b3e4-1b03445a863e','d3c41f78-c6c4-4d5a-876c-9ad62a54d09c',
  'e1e72f28-2be4-47a9-ab49-52f304d3f7bc','e7c61789-619c-4cc1-9a30-2e6e3298b32e',
  'bf0d0292-12ae-4866-9010-950632cdfa47','0b1db6b4-5552-4f7e-bf0d-11ee0fde6a06',
  '96679092-ad41-4f70-ba1f-9756ce18fb00'
);