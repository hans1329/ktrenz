-- Extend ktrenz_h1_my_history with current cohort rank so users get an
-- interim feedback signal during the 7-day wait. Without this, every pending
-- vouch just shows 'pending' for a week — felt empty and unrewarding.
--
-- current_rank = DENSE_RANK by engagement_score within (drop_date, region)
-- cohort_size  = total drops in the same cohort
-- A vouch with current_rank <= 30% of cohort_size is provisionally "on track"
-- to hit (resolution rule per PRD §6).
--
-- DROP + CREATE because RETURNS TABLE signature changes; CREATE OR REPLACE
-- can't alter return type.

DROP FUNCTION IF EXISTS public.ktrenz_h1_my_history(INT, INT);

CREATE OR REPLACE FUNCTION public.ktrenz_h1_my_history(_limit INT DEFAULT 50, _offset INT DEFAULT 0)
RETURNS TABLE (
  vouch_id          UUID,
  drop_id           UUID,
  drop_date         DATE,
  confidence        TEXT,
  vouched_at        TIMESTAMPTZ,
  resolved          BOOL,
  hit               BOOL,
  raw_score         NUMERIC,
  final_score       NUMERIC,
  k_cash            INT,
  item_id           UUID,
  source            TEXT,
  title             TEXT,
  thumbnail         TEXT,
  url               TEXT,
  star_display_name TEXT,
  star_image_url    TEXT,
  current_rank      INT,
  cohort_size       INT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH cohort_rank AS (
    SELECT
      d.id AS drop_id,
      DENSE_RANK() OVER (
        PARTITION BY d.drop_date, d.region
        ORDER BY COALESCE(i.engagement_score, 0) DESC
      )::INT AS rnk,
      COUNT(*) OVER (PARTITION BY d.drop_date, d.region)::INT AS cohort_size
    FROM public.ktrenz_h1_daily_drop d
    JOIN public.ktrenz_b2_items i ON i.id = d.item_id
  )
  SELECT
    v.id            AS vouch_id,
    v.drop_id,
    d.drop_date,
    v.confidence,
    v.vouched_at,
    v.resolved,
    v.hit,
    v.raw_score,
    v.final_score,
    v.k_cash,
    i.id            AS item_id,
    i.source,
    i.title,
    i.thumbnail,
    i.url,
    s.display_name  AS star_display_name,
    s.image_url     AS star_image_url,
    cr.rnk          AS current_rank,
    cr.cohort_size
  FROM public.ktrenz_h1_vouches v
  JOIN public.ktrenz_h1_daily_drop d ON d.id = v.drop_id
  JOIN public.ktrenz_b2_items i ON i.id = d.item_id
  LEFT JOIN public.ktrenz_stars s ON s.id = i.star_id
  LEFT JOIN cohort_rank cr ON cr.drop_id = v.drop_id
  WHERE v.user_id = auth.uid()
  ORDER BY v.vouched_at DESC
  LIMIT GREATEST(_limit, 0)
  OFFSET GREATEST(_offset, 0);
$$;

GRANT EXECUTE ON FUNCTION public.ktrenz_h1_my_history(INT, INT) TO authenticated;
