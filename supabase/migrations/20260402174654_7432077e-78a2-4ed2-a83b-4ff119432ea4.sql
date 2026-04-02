
-- Full trend data reset: truncate all keyword/trend tables with CASCADE
TRUNCATE TABLE
  ktrenz_trend_bets,
  ktrenz_trend_markets,
  ktrenz_trend_ai_insights,
  ktrenz_trend_tracking,
  ktrenz_trend_triggers,
  ktrenz_keyword_boosts,
  ktrenz_keyword_follows,
  ktrenz_keyword_notifications,
  ktrenz_keyword_votes,
  ktrenz_keyword_sources,
  ktrenz_keywords
CASCADE;

-- Reset detection state on all stars so next pipeline scans from scratch
UPDATE ktrenz_stars
SET last_detected_at = NULL,
    last_detect_result = NULL;
