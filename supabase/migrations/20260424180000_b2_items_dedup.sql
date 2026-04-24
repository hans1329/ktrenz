-- Deduplicate near-identical content items inside ktrenz_b2_items.
-- Rationale: same article is often syndicated across multiple outlets / sources
-- (e.g., Lotte Department Store brand campaign for aespa appearing as multiple
-- rows with near-identical titles). Battle UI should only show one representative.
--
-- Strategy: add STORED generated columns that derive a dedup key from URL and
-- title. An RPC then returns DISTINCT ON per (run_id, dedup_key) ordered by
-- engagement_score so the representative with highest engagement wins.

-- 1. Canonical URL: strip query string + fragment, lowercase.
ALTER TABLE public.ktrenz_b2_items
  ADD COLUMN IF NOT EXISTS dedup_url_key TEXT
  GENERATED ALWAYS AS (
    CASE
      WHEN url IS NULL OR url = '' THEN NULL
      ELSE lower(regexp_replace(url, '[?#].*$', ''))
    END
  ) STORED;

-- 2. Title prefix key: lowercase, strip punctuation, collapse whitespace, first 40 chars.
ALTER TABLE public.ktrenz_b2_items
  ADD COLUMN IF NOT EXISTS dedup_title_key TEXT
  GENERATED ALWAYS AS (
    NULLIF(
      lower(left(
        regexp_replace(
          regexp_replace(coalesce(title, ''), '[[:punct:]]+', ' ', 'g'),
          '\s+', ' ', 'g'
        ),
        40
      )),
      ''
    )
  ) STORED;

-- 3. Unified dedup key — prefer canonical URL, fall back to title prefix.
--    Items sharing dedup_key are treated as the same event/article.
ALTER TABLE public.ktrenz_b2_items
  ADD COLUMN IF NOT EXISTS dedup_key TEXT
  GENERATED ALWAYS AS (
    coalesce(
      CASE
        WHEN url IS NULL OR url = '' THEN NULL
        ELSE 'u:' || lower(regexp_replace(url, '[?#].*$', ''))
      END,
      CASE
        WHEN title IS NULL OR title = '' THEN NULL
        ELSE 't:' || lower(left(
          regexp_replace(
            regexp_replace(title, '[[:punct:]]+', ' ', 'g'),
            '\s+', ' ', 'g'
          ),
          40
        ))
      END
    )
  ) STORED;

-- 4. Index for the Battle dedup query pattern.
CREATE INDEX IF NOT EXISTS idx_b2_items_run_dedup
  ON public.ktrenz_b2_items (run_id, dedup_key, engagement_score DESC NULLS LAST);

-- 5. RPC that Battle calls instead of a raw .in() select.
--    Returns DISTINCT ON (run_id, dedup_key) ordered by engagement.
CREATE OR REPLACE FUNCTION public.ktrenz_get_battle_items_deduped(
  p_run_ids uuid[]
)
RETURNS SETOF public.ktrenz_b2_items
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT DISTINCT ON (run_id, dedup_key) *
  FROM public.ktrenz_b2_items
  WHERE run_id = ANY(p_run_ids)
    AND has_thumbnail = true
    AND source != 'naver_blog'
    AND dedup_key IS NOT NULL
  ORDER BY run_id, dedup_key, engagement_score DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.ktrenz_get_battle_items_deduped(uuid[])
  TO anon, authenticated, service_role;
