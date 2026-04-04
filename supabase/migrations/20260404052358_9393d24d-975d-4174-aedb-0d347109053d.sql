
TRUNCATE public.ktrenz_keyword_sources CASCADE;
TRUNCATE public.ktrenz_keywords CASCADE;
TRUNCATE public.ktrenz_trend_triggers CASCADE;
TRUNCATE public.ktrenz_trend_tracking CASCADE;
TRUNCATE public.ktrenz_data_snapshots CASCADE;
TRUNCATE public.ktrenz_pipeline_state CASCADE;

UPDATE public.ktrenz_stars SET last_detected_at = NULL, last_detect_result = NULL WHERE last_detected_at IS NOT NULL;
