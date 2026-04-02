-- ktrenz_trend_tracking에 velocity 컬럼 추가
ALTER TABLE public.ktrenz_trend_tracking
ADD COLUMN IF NOT EXISTS velocity real DEFAULT 0;

-- ktrenz_keywords에 velocity 컬럼 추가
ALTER TABLE public.ktrenz_keywords
ADD COLUMN IF NOT EXISTS velocity real DEFAULT 0;