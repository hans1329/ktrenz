-- ktrenz_point_transactions에 description 컬럼 추가 (기존 함수가 참조하고 있음)
ALTER TABLE public.ktrenz_point_transactions
ADD COLUMN IF NOT EXISTS description text;