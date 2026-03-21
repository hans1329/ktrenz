-- 트렌드 수집 데이터 전체 초기화 (마지막)
TRUNCATE TABLE public.ktrenz_trend_tracking;
TRUNCATE TABLE public.ktrenz_trend_triggers CASCADE;

-- 파이프라인 상태 초기화
UPDATE public.ktrenz_pipeline_state SET status = 'completed' WHERE status IN ('running', 'postprocess_requested', 'postprocess_running');

-- 스타 감지 로그 초기화
UPDATE public.ktrenz_stars SET last_detected_at = NULL, last_detect_result = NULL WHERE last_detected_at IS NOT NULL;