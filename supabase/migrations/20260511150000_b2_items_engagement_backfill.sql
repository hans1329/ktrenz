-- Backfill ktrenz_b2_items.engagement_score from existing metadata.
--
-- Why: until 2026-05-11 content-search wrote engagement_score = per-artist
-- contentScore (sum of items collected for that artist), making every card
-- of the same artist show identical "Buzz now". Going forward content-search
-- writes per-item signals (TikTok plays / IG likes / YouTube views). This
-- backfill upgrades existing rows where metadata already carries the signal.
--
-- Sources that benefit:
--   - TikTok    → metadata.plays (always populated)
--   - Instagram → metadata.likes
--   - YouTube   → metadata.views (only for items collected AFTER the
--                  videos.list fix; older items don't have views in
--                  metadata so they stay at contentScore)
--   - Reddit/Naver → no signals available in metadata; stays at fallback
--
-- Safe to re-run: COALESCE keeps the current value when no per-item signal
-- can be derived, so already-good rows are untouched.

UPDATE public.ktrenz_b2_items
SET engagement_score = derived
FROM (
  SELECT
    id,
    GREATEST(
      COALESCE(NULLIF((metadata->>'plays')::numeric,     0)::int, 0),
      COALESCE(NULLIF((metadata->>'views')::numeric,     0)::int, 0),
      COALESCE(NULLIF((metadata->>'viewCount')::numeric, 0)::int, 0),
      COALESCE(NULLIF((metadata->>'likes')::numeric,     0)::int, 0),
      COALESCE(NULLIF((metadata->>'ups')::numeric,       0)::int, 0),
      COALESCE(NULLIF((metadata->>'score')::numeric,     0)::int, 0)
    ) AS derived
  FROM public.ktrenz_b2_items
  WHERE metadata IS NOT NULL
    AND (
      (metadata ? 'plays')     OR
      (metadata ? 'views')     OR
      (metadata ? 'viewCount') OR
      (metadata ? 'likes')     OR
      (metadata ? 'ups')       OR
      (metadata ? 'score')
    )
) AS src
WHERE public.ktrenz_b2_items.id = src.id
  AND src.derived > 0;
