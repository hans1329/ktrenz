
-- 트렌드 데이터 전체 리셋
TRUNCATE TABLE public.ktrenz_keywords CASCADE;
TRUNCATE TABLE public.ktrenz_keyword_sources CASCADE;
TRUNCATE TABLE public.ktrenz_trend_tracking CASCADE;
TRUNCATE TABLE public.ktrenz_trend_triggers CASCADE;
TRUNCATE TABLE public.ktrenz_social_snapshots CASCADE;
TRUNCATE TABLE public.ktrenz_collection_log CASCADE;
TRUNCATE TABLE public.ktrenz_shopping_tracking CASCADE;

-- 파이프라인 상태 초기화
UPDATE public.ktrenz_pipeline_state SET status = 'idle', updated_at = now();

-- 스타 테이블의 수집 상태 초기화
UPDATE public.ktrenz_stars SET last_detected_at = NULL, last_detect_result = NULL;
