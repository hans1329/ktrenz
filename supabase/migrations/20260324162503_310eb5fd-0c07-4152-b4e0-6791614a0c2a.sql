-- Reset all trend-related data for fresh collection
TRUNCATE TABLE ktrenz_trend_tracking CASCADE;
TRUNCATE TABLE ktrenz_trend_bets CASCADE;
TRUNCATE TABLE ktrenz_trend_markets CASCADE;
TRUNCATE TABLE ktrenz_trend_ai_insights CASCADE;
TRUNCATE TABLE ktrenz_trend_artist_grades CASCADE;
TRUNCATE TABLE ktrenz_trend_triggers CASCADE;
TRUNCATE TABLE ktrenz_category_trends CASCADE;
TRUNCATE TABLE ktrenz_social_snapshots CASCADE;
TRUNCATE TABLE ktrenz_keyword_boosts CASCADE;
TRUNCATE TABLE ktrenz_keyword_votes CASCADE;
TRUNCATE TABLE ktrenz_keyword_notifications CASCADE;
TRUNCATE TABLE ktrenz_pipeline_state CASCADE;
TRUNCATE TABLE ktrenz_collection_log CASCADE;
TRUNCATE TABLE ktrenz_engine_runs CASCADE;