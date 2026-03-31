-- delta_pct overflow 수정: numeric(8,2) → real (weighted_delta와 동일)
ALTER TABLE ktrenz_trend_tracking ALTER COLUMN delta_pct TYPE real;