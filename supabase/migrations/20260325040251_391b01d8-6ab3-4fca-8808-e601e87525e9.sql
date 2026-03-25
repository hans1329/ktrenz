-- Reset all keyword trend data for fresh collection with new editorial context style
-- 1) Delete tracking data (child references first)
DELETE FROM ktrenz_trend_tracking;

-- 2) Delete social snapshots
DELETE FROM ktrenz_social_snapshots;

-- 3) Delete all trend triggers
DELETE FROM ktrenz_trend_triggers;

-- 4) Reset pipeline state to start fresh
DELETE FROM ktrenz_pipeline_state;