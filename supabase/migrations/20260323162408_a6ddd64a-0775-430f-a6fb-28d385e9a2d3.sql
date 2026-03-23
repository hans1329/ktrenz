-- Reset all trend data for re-collection with improved detection
TRUNCATE TABLE ktrenz_trend_bets CASCADE;
TRUNCATE TABLE ktrenz_trend_markets CASCADE;
TRUNCATE TABLE ktrenz_trend_tracking CASCADE;
TRUNCATE TABLE ktrenz_trend_ai_insights CASCADE;
TRUNCATE TABLE ktrenz_trend_artist_grades CASCADE;
TRUNCATE TABLE ktrenz_trend_triggers CASCADE;
TRUNCATE TABLE ktrenz_pipeline_state CASCADE;