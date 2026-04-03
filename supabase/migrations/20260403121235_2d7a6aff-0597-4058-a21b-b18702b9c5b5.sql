
TRUNCATE 
  ktrenz_keywords,
  ktrenz_keyword_sources,
  ktrenz_keyword_boosts,
  ktrenz_keyword_follows,
  ktrenz_keyword_notifications,
  ktrenz_keyword_votes,
  ktrenz_trend_tracking,
  ktrenz_trend_ai_insights,
  ktrenz_trend_artist_grades,
  ktrenz_trend_bets,
  ktrenz_trend_markets,
  ktrenz_trend_triggers
CASCADE;

UPDATE ktrenz_stars SET last_detected_at = NULL, last_detect_result = NULL;
