
-- 기존 tracking 데이터로 baseline/peak/influence 소급 계산
WITH stats AS (
  SELECT 
    trigger_id,
    MIN(interest_score) FILTER (WHERE interest_score > 0) as baseline,
    MAX(interest_score) as peak
  FROM ktrenz_trend_tracking
  WHERE region = 'worldwide'
  GROUP BY trigger_id
)
UPDATE ktrenz_trend_triggers 
SET 
  baseline_score = COALESCE(s.baseline, 0),
  peak_score = COALESCE(s.peak, 0),
  influence_index = CASE 
    WHEN COALESCE(s.baseline, 0) > 0 AND COALESCE(s.peak, 0) > s.baseline 
    THEN ROUND(((s.peak - s.baseline)::numeric / s.baseline) * 100, 2)
    ELSE 0 
  END
FROM stats s
WHERE ktrenz_trend_triggers.id = s.trigger_id;
