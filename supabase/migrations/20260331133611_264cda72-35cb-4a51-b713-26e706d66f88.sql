-- ktrenz_trend_tracking: trigger_id, wiki_entry_id를 nullable로 변경 (K2에서는 keyword_id 기반)
ALTER TABLE ktrenz_trend_tracking ALTER COLUMN trigger_id DROP NOT NULL;
ALTER TABLE ktrenz_trend_tracking ALTER COLUMN wiki_entry_id DROP NOT NULL;