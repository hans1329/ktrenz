
TRUNCATE 
  ktrenz_trend_triggers,
  ktrenz_keywords,
  ktrenz_keyword_sources,
  ktrenz_social_snapshots,
  ktrenz_shopping_tracking,
  ktrenz_collection_log,
  ktrenz_pipeline_state
CASCADE;

UPDATE ktrenz_stars
SET last_detected_at = NULL,
    last_detect_result = NULL;
