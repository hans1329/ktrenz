-- Insert known brands with domains for Clearbit logo
INSERT INTO ktrenz_brand_registry (brand_name, brand_name_ko, domain, category) VALUES
  ('Apple', '애플', 'apple.com', 'tech'),
  ('Samsung', '삼성', 'samsung.com', 'tech'),
  ('CELINE', '셀린느', 'celine.com', 'luxury'),
  ('Louis Vuitton', '루이 비통', 'louisvuitton.com', 'luxury'),
  ('Polo Ralph Lauren', '폴로 랄프 로렌', 'ralphlauren.com', 'luxury'),
  ('Tommy Jeans', '타미 진스', 'tommy.com', 'fashion'),
  ('Issey Miyake', '이세이 미야케', 'isseymiyake.com', 'luxury'),
  ('Harley-Davidson', '할리데이비슨', 'harley-davidson.com', 'lifestyle'),
  ('UNICEF', '유니세프', 'unicef.org', 'ngo'),
  ('Hera', '헤라', 'hfrbeauty.com', 'beauty'),
  ('Bioré UV', '비오레 UV', 'biore.com', 'beauty'),
  ('Mexicana', '멕시카나', 'mexicana.co.kr', 'food'),
  ('Lotte Cinema', '롯데시네마', 'lottecinema.co.kr', 'entertainment'),
  ('OPEN YY', '오픈와이와이', 'openyy.com', 'fashion'),
  ('LMOOD', '엘무드', NULL, 'fashion'),
  ('irecipe', '아이레시피', NULL, 'beauty'),
  ('Fivonnee', '피보와느', NULL, 'fashion'),
  ('High Up', '하이업', NULL, 'entertainment'),
  ('Berriz', '베리즈', NULL, 'fashion'),
  ('Bunnies', '버니즈', NULL, 'fashion'),
  ('s/e/o', '에스이오', NULL, 'fashion'),
  ('Wackywilly', '와키윌리', NULL, 'fashion'),
  ('SEVENTEEN', '세븐틴', NULL, 'entertainment')
ON CONFLICT (brand_name) DO NOTHING;

-- Set logo_url from Clearbit for brands with domains
UPDATE ktrenz_brand_registry
SET logo_url = 'https://logo.clearbit.com/' || domain
WHERE domain IS NOT NULL AND logo_url IS NULL;

-- Map brand_id for brand keywords
UPDATE ktrenz_trend_triggers t
SET brand_id = b.id
FROM ktrenz_brand_registry b
WHERE t.keyword_category = 'brand'
  AND t.keyword_en = b.brand_name
  AND t.brand_id IS NULL;

-- Map products to parent brands
UPDATE ktrenz_trend_triggers SET brand_id = (SELECT id FROM ktrenz_brand_registry WHERE brand_name = 'Apple')
WHERE keyword_en = 'AirPods Max' AND brand_id IS NULL;

UPDATE ktrenz_trend_triggers SET brand_id = (SELECT id FROM ktrenz_brand_registry WHERE brand_name = 'Samsung')
WHERE keyword_en = 'Galaxy S26 Ultra' AND brand_id IS NULL;

UPDATE ktrenz_trend_triggers SET brand_id = (SELECT id FROM ktrenz_brand_registry WHERE brand_name = 'SEVENTEEN')
WHERE keyword_en = 'Puzzle SEVENTEEN' AND brand_id IS NULL;

-- Harley-Davidson Collections → Harley-Davidson
UPDATE ktrenz_trend_triggers SET brand_id = (SELECT id FROM ktrenz_brand_registry WHERE brand_name = 'Harley-Davidson')
WHERE keyword_en = 'Harley-Davidson Collections' AND brand_id IS NULL;