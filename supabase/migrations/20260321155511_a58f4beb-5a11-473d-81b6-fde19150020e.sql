-- T2 데이터 리셋: 파이프라인 상태, 트렌드 추적, 트렌드 트리거 초기화
DELETE FROM public.ktrenz_pipeline_state;
DELETE FROM public.ktrenz_trend_tracking;
DELETE FROM public.ktrenz_trend_triggers;
UPDATE public.ktrenz_stars SET last_detected_at = NULL, last_detect_result = NULL;