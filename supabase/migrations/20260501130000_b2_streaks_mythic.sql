-- Sprint 2B: Streak/Accuracy multiplier + Mythic band
--
-- Goal: introduce a power-law to Battle rewards. Top forecasters earn 1.5–2×
-- on wins (currently they earn ~2-4× casual users — too narrow to retain
-- skilled fans). Also separates skill (rising/surge) from lottery (mythic)
-- by lowering surge threshold to 50% and adding mythic at 100%+.
--
-- Why this matters: Battle's data quality DEPENDS on retaining users who
-- pick well consistently. If their advantage caps at 4×, churn risk is
-- high. With ×2 streak multiplier + mythic, a strong forecaster can earn
-- 10×+ a casual user — proper power-law.

-- ─── 1. Allow 'mythic' as a valid band on b2_predictions ───
ALTER TABLE public.b2_predictions DROP CONSTRAINT IF EXISTS b2_predictions_band_check;
ALTER TABLE public.b2_predictions ADD CONSTRAINT b2_predictions_band_check
  CHECK (band IN ('steady', 'rising', 'surge', 'mythic'));

-- ─── 2. Add streak / hit-rate columns to ktrenz_user_points ───
-- These are denormalized snapshots refreshed at settlement time. Cheaper
-- than computing on every UI read, and the lookup happens for *every* pick
-- in CommitBar (multiplier preview).
ALTER TABLE public.ktrenz_user_points
  ADD COLUMN IF NOT EXISTS hit_rate_7d NUMERIC,
  ADD COLUMN IF NOT EXISTS hit_rate_7d_n INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hit_rate_30d NUMERIC,
  ADD COLUMN IF NOT EXISTS hit_rate_30d_n INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_streak INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streak_updated_at TIMESTAMPTZ;

-- ─── 3. Recompute function ───
-- Called from settle-trend-vs after each user's predictions are settled.
-- Idempotent: safe to call multiple times.
CREATE OR REPLACE FUNCTION public.ktrenz_recompute_user_streak(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hr7 NUMERIC;
  _hr7_n INTEGER;
  _hr30 NUMERIC;
  _hr30_n INTEGER;
  _streak INTEGER;
BEGIN
  -- 7-day window
  SELECT
    COALESCE(COUNT(*) FILTER (WHERE status = 'won')::NUMERIC / NULLIF(COUNT(*), 0)::NUMERIC, 0),
    COUNT(*)::INTEGER
  INTO _hr7, _hr7_n
  FROM b2_predictions
  WHERE user_id = p_user_id
    AND status IN ('won', 'lost')
    AND settled_at >= now() - interval '7 days';

  -- 30-day window
  SELECT
    COALESCE(COUNT(*) FILTER (WHERE status = 'won')::NUMERIC / NULLIF(COUNT(*), 0)::NUMERIC, 0),
    COUNT(*)::INTEGER
  INTO _hr30, _hr30_n
  FROM b2_predictions
  WHERE user_id = p_user_id
    AND status IN ('won', 'lost')
    AND settled_at >= now() - interval '30 days';

  -- Current win streak: consecutive wins from the most recent settled pick.
  -- If the most recent settled pick is a loss, streak = 0.
  WITH ordered AS (
    SELECT status, ROW_NUMBER() OVER (ORDER BY settled_at DESC) AS rn
    FROM b2_predictions
    WHERE user_id = p_user_id AND status IN ('won', 'lost')
  )
  SELECT COALESCE(
    (SELECT MIN(rn) - 1 FROM ordered WHERE status = 'lost'),
    (SELECT COUNT(*) FROM ordered)
  )::INTEGER
  INTO _streak;

  -- Upsert. Other point fields preserved.
  INSERT INTO ktrenz_user_points (
    user_id, points, lifetime_points,
    hit_rate_7d, hit_rate_7d_n, hit_rate_30d, hit_rate_30d_n,
    current_streak, streak_updated_at
  )
  VALUES (
    p_user_id, 0, 0,
    COALESCE(_hr7, 0), COALESCE(_hr7_n, 0), COALESCE(_hr30, 0), COALESCE(_hr30_n, 0),
    COALESCE(_streak, 0), now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    hit_rate_7d = EXCLUDED.hit_rate_7d,
    hit_rate_7d_n = EXCLUDED.hit_rate_7d_n,
    hit_rate_30d = EXCLUDED.hit_rate_30d,
    hit_rate_30d_n = EXCLUDED.hit_rate_30d_n,
    current_streak = EXCLUDED.current_streak,
    streak_updated_at = EXCLUDED.streak_updated_at,
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.ktrenz_recompute_user_streak(UUID) TO service_role;
