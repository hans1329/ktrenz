-- Growth-rate based viral resolution.
--
-- Old model: viral = engagement_score absolute rank in top 30% at resolve time.
-- Problem: big-artist content (BTS / NewJeans MV etc.) is virtually guaranteed
-- to land in top 30% from day-1 simply due to channel-level baseline volume.
-- Predictions were near-deterministic for established artists → no game.
--
-- New model: viral = GROWTH RATIO over the 7-day window, top 30% of cohort.
-- Captures "this is rising fast" rather than "this had high absolute numbers".
--
-- Mechanism:
--   1. Snapshot engagement_score at drop time in `ktrenz_h1_daily_drop.views_at_drop`
--   2. At resolve, compute growth_ratio = (now - drop) / max(drop, baseline)
--   3. Rank cohort by growth_ratio; top 30% are viral.

ALTER TABLE public.ktrenz_h1_daily_drop
  ADD COLUMN IF NOT EXISTS views_at_drop BIGINT;

-- Backfill: existing unresolved drops get the current engagement_score as the
-- drop-time snapshot. Imperfect (drops created earlier today already had
-- growth happening) but unblocks resolution for in-flight rounds.
UPDATE public.ktrenz_h1_daily_drop d
SET views_at_drop = b.engagement_score
FROM public.ktrenz_b2_items b
WHERE d.item_id = b.id
  AND d.views_at_drop IS NULL
  AND d.resolved = false;
