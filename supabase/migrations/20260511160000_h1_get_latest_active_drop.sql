-- ktrenz_h1_get_today_drop — rebroaden to "latest active drop" semantics.
--
-- Previous behavior: strict WHERE drop_date = current_date. Result: when
-- today's curate hadn't run yet (or daily_drop was empty for any reason),
-- the RPC returned nothing and the client fell back to b2_items pool —
-- losing all our dedup work in curate-drop and exposing duplicates.
--
-- New behavior: return rows for the most recent drop_date that has any
-- rows for the region. Falls back gracefully across cron lateness, manual
-- regens, or KST/UTC boundary effects. If no drops exist anywhere, returns
-- empty and the client's fetchFallbackPool kicks in as before.

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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  _latest_date DATE;
BEGIN
  -- Pick the most recent drop_date with rows for this region. Prefers an
  -- unresolved drop if both resolved and unresolved exist (so we don't
  -- regress to a finalized round just because cron is late).
  SELECT d.drop_date INTO _latest_date
  FROM public.ktrenz_h1_daily_drop d
  WHERE d.region = _region
  ORDER BY (d.resolved = false) DESC, d.drop_date DESC
  LIMIT 1;

  IF _latest_date IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
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
  WHERE d.drop_date = _latest_date
    AND d.region = _region
  ORDER BY d.cohort_rank ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ktrenz_h1_get_today_drop(TEXT) TO anon, authenticated;
