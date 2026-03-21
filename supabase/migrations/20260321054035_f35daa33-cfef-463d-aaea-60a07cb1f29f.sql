
-- Reset peak_score for triggers where baseline==peak (first tracking set both identical)
-- This allows the next tracking run to properly calculate influence_index
UPDATE ktrenz_trend_triggers 
SET peak_score = NULL, peak_at = NULL, influence_index = 0.00 
WHERE status = 'active' 
  AND baseline_score IS NOT NULL 
  AND baseline_score = peak_score;
