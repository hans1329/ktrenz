-- Complete pipeline reset: clear all pipeline state and collection logs
DELETE FROM ktrenz_pipeline_state;
DELETE FROM ktrenz_collection_log WHERE platform IN ('trend_detect','trend_postprocess','trend_cron','trend_track','trend_postprocess');
DELETE FROM ktrenz_trend_triggers;