
TRUNCATE ktrenz_trend_triggers CASCADE;
TRUNCATE ktrenz_keywords CASCADE;
TRUNCATE ktrenz_keyword_sources CASCADE;
TRUNCATE ktrenz_trend_tracking CASCADE;
TRUNCATE ktrenz_social_snapshots CASCADE;

UPDATE ktrenz_stars SET last_detected_at = NULL, last_detect_result = NULL;

UPDATE ktrenz_pipeline_state SET status = 'done', current_offset = 0, postprocess_done = false;
