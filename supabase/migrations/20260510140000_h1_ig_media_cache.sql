-- DB cache for Instagram media URLs.
--
-- Why: the ktrenz-instagram-media resolver does a slow RapidAPI feed fetch
-- (2-5s, sometimes 10s on cold paths). We already cache per-tab in memory
-- and per-browser in localStorage, but those don't help users on a fresh
-- device or first visit. A shared DB cache amortizes the resolve cost
-- across the whole audience for the ~30 min IG CDN URL TTL.
--
-- Read path:
--   1. ktrenz_h1_ig_cached_media(item_id) — fast read of cached items
--   2. If miss, the edge fn calls RapidAPI and writes back here
--
-- Write path:
--   - ktrenz-instagram-media edge fn (post-resolve)
--   - ktrenz-h1-curate-drop (pre-warm at curate time so users hit warm cache)

CREATE TABLE IF NOT EXISTS public.ktrenz_h1_ig_media_cache (
  item_id     UUID PRIMARY KEY REFERENCES public.ktrenz_b2_items(id) ON DELETE CASCADE,
  shortcode   TEXT        NOT NULL,
  items       JSONB       NOT NULL,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_h1_ig_cache_expires ON public.ktrenz_h1_ig_media_cache (expires_at);

ALTER TABLE public.ktrenz_h1_ig_media_cache ENABLE ROW LEVEL SECURITY;

-- Read by everyone authenticated (cache is non-sensitive; URLs are public).
-- No client write — only service role + the helper RPC below.
DROP POLICY IF EXISTS "h1 ig cache: readable" ON public.ktrenz_h1_ig_media_cache;
CREATE POLICY "h1 ig cache: readable"
  ON public.ktrenz_h1_ig_media_cache
  FOR SELECT
  USING (true);

-- Helper RPC: returns the cached items array, or NULL if missing/expired.
-- Cheap call — clients hit this BEFORE invoking the edge function so they
-- skip the round-trip when the cache is warm.
CREATE OR REPLACE FUNCTION public.ktrenz_h1_ig_cached_media(_item_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT items
  FROM public.ktrenz_h1_ig_media_cache
  WHERE item_id = _item_id
    AND expires_at > now()
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.ktrenz_h1_ig_cached_media(UUID) TO anon, authenticated;

-- Garbage collect expired rows. Cheap to run as part of curate cron or any
-- daily job. Keeping expired rows is harmless (queries filter by expires_at)
-- but they accumulate over time.
CREATE OR REPLACE FUNCTION public.ktrenz_h1_ig_cache_gc()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _deleted INT;
BEGIN
  DELETE FROM public.ktrenz_h1_ig_media_cache
  WHERE expires_at < now() - INTERVAL '1 day';
  GET DIAGNOSTICS _deleted = ROW_COUNT;
  RETURN _deleted;
END;
$$;
