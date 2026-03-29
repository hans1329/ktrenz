-- Reset peak_score and influence_index to be recalculated on next track run
-- Set peak_score = baseline_score (same scale) and influence_index = 0
UPDATE ktrenz_trend_triggers
SET peak_score = baseline_score,
    influence_index = 0
WHERE status = 'active'
  AND baseline_score > 0;