-- ktrenz_h1_get_today_drop — RPC the Discover (h1) client calls instead of
-- hitting ktrenz_b2_items directly. Returns today's curated drop joined
-- with item + star info, ordered by cohort_rank.
--
-- Falls back to "drop is empty" gracefully — the client renders an empty
-- state and the curate cron will populate later. Lazy-create via
-- ktrenz_h1_record_vouch still works as a backstop.

CREATE OR REPLACE FUNCTION public.ktrenz_h1_get_today_drop(_region TEXT DEFAULT 'global')
RETURNS TABLE (
  drop_id            UUID,
  cohort_rank        INT,
  item_id            UUID,
  source             TEXT,
  title              TEXT,
  title_en           TEXT,
  title_ja           TEXT,
  title_zh           TEXT,
  title_ko           TEXT,
  description        TEXT,
  description_en     TEXT,
  description_ja     TEXT,
  description_zh     TEXT,
  description_ko     TEXT,
  thumbnail          TEXT,
  url                TEXT,
  engagement_score   NUMERIC,
  published_at       TIMESTAMPTZ,
  star_id            UUID,
  star_display_name  TEXT,
  star_image_url     TEXT,
  resolution_at      TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    d.id              AS drop_id,
    d.cohort_rank,
    i.id              AS item_id,
    i.source,
    i.title,
    i.title_en,
    i.title_ja,
    i.title_zh,
    i.title_ko,
    i.description,
    i.description_en,
    i.description_ja,
    i.description_zh,
    i.description_ko,
    i.thumbnail,
    i.url,
    i.engagement_score::NUMERIC,
    i.published_at,
    s.id              AS star_id,
    s.display_name    AS star_display_name,
    s.image_url       AS star_image_url,
    d.resolution_at
  FROM public.ktrenz_h1_daily_drop d
  JOIN public.ktrenz_b2_items i ON i.id = d.item_id
  LEFT JOIN public.ktrenz_stars s ON s.id = i.star_id
  WHERE d.drop_date = current_date
    AND d.region = _region
  ORDER BY d.cohort_rank ASC;
$$;

GRANT EXECUTE ON FUNCTION public.ktrenz_h1_get_today_drop(TEXT) TO anon, authenticated;
