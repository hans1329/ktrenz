-- peak_score가 baseline_score보다 작은 경우 baseline 값으로 보정
UPDATE ktrenz_trend_triggers
SET peak_score = baseline_score,
    influence_index = 0
WHERE status = 'active'
  AND (peak_score IS NULL OR peak_score < baseline_score);