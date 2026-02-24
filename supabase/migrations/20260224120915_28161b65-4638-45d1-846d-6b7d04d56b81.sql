
-- v3_scores에 음반 판매량 스코어 컬럼 추가
ALTER TABLE public.v3_scores 
  ADD COLUMN IF NOT EXISTS album_sales_score integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS album_sales_data jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS album_sales_updated_at timestamptz;
