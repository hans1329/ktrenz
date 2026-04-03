TRUNCATE ktrenz_trend_bets, ktrenz_shopping_tracking, ktrenz_trend_tracking, ktrenz_keyword_sources, ktrenz_keywords, ktrenz_trend_triggers, ktrenz_pipeline_state CASCADE;

UPDATE ktrenz_stars SET last_detected_at = NULL, last_detect_result = NULL;