-- ktrenz_trend_triggers에 prev_api_total 컬럼 추가 (일일 증가량 계산용)
ALTER TABLE public.ktrenz_trend_triggers
ADD COLUMN IF NOT EXISTS prev_api_total bigint DEFAULT 0;