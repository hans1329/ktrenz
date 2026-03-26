INSERT INTO ktrenz_brand_registry (brand_name, brand_name_ko, category, is_active)
VALUES 
  ('adidas', '아디다스', 'fashion', true),
  ('Shin Ramyun', '신라면', 'food', true),
  ('Nongshim', '농심', 'food', true)
ON CONFLICT DO NOTHING;