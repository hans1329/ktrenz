-- h1 (Discover) backend persistence — P2 of the Discover roadmap.
--
-- Replaces client-side localStorage vouches with server-backed records, and
-- lays down the schema needed by P3 curation (drop set), P4 resolution, and
-- P7 leaderboard. Drop rows are created on-demand by ktrenz_h1_record_vouch
-- until P3's curation cron pre-populates them.
--
-- See docs/h1-prd.md §12 (data model) and §13 (RPCs).

-- ─── Tables ───────────────────────────────────────────────────────────

CREATE TABLE public.ktrenz_h1_daily_drop (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drop_date     DATE        NOT NULL,
  region        TEXT        NOT NULL DEFAULT 'global',
  item_id       UUID        NOT NULL REFERENCES public.ktrenz_b2_items(id) ON DELETE CASCADE,
  cohort_rank   INT         NOT NULL,
  resolution_at TIMESTAMPTZ NOT NULL,
  resolved      BOOL        NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (drop_date, region, item_id)
);
CREATE INDEX idx_h1_drop_date_region_rank ON public.ktrenz_h1_daily_drop (drop_date, region, cohort_rank);
CREATE INDEX idx_h1_drop_resolution ON public.ktrenz_h1_daily_drop (resolution_at) WHERE resolved = false;

CREATE TABLE public.ktrenz_h1_vouches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  drop_id     UUID        NOT NULL REFERENCES public.ktrenz_h1_daily_drop(id) ON DELETE CASCADE,
  confidence  TEXT        NOT NULL CHECK (confidence IN ('low','mid','high')),
  vouched_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Resolution fields — populated by ktrenz-h1-resolve-drop edge function (P4)
  resolved    BOOL        NOT NULL DEFAULT false,
  hit         BOOL,
  raw_score   NUMERIC,
  final_score NUMERIC,
  k_cash      INT,
  ktnz_minted NUMERIC,
  UNIQUE (user_id, drop_id)
);
CREATE INDEX idx_h1_vouches_user_time ON public.ktrenz_h1_vouches (user_id, vouched_at DESC);
CREATE INDEX idx_h1_vouches_drop ON public.ktrenz_h1_vouches (drop_id);
CREATE INDEX idx_h1_vouches_unresolved ON public.ktrenz_h1_vouches (drop_id) WHERE resolved = false;

CREATE TABLE public.ktrenz_h1_resolution (
  drop_id           UUID PRIMARY KEY REFERENCES public.ktrenz_h1_daily_drop(id) ON DELETE CASCADE,
  views_at_drop     BIGINT,
  views_at_resolve  BIGINT,
  growth_delta      BIGINT,
  cohort_percentile NUMERIC,    -- 0..1, where item ranks within its cohort
  is_viral          BOOL,
  resolved_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.ktrenz_h1_leaderboard_daily (
  drop_date   DATE NOT NULL,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total_score NUMERIC NOT NULL DEFAULT 0,
  hits        INT     NOT NULL DEFAULT 0,
  misses      INT     NOT NULL DEFAULT 0,
  rank        INT,
  PRIMARY KEY (drop_date, user_id)
);
CREATE INDEX idx_h1_leaderboard_date_rank ON public.ktrenz_h1_leaderboard_daily (drop_date, rank);

-- ─── RLS ──────────────────────────────────────────────────────────────

ALTER TABLE public.ktrenz_h1_daily_drop          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ktrenz_h1_vouches             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ktrenz_h1_resolution          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ktrenz_h1_leaderboard_daily   ENABLE ROW LEVEL SECURITY;

-- daily_drop: read by anyone (today's drop is public catalog); writes via RPC only
CREATE POLICY "h1 drops readable by all"
  ON public.ktrenz_h1_daily_drop
  FOR SELECT
  USING (true);

-- vouches: user can SELECT/INSERT own; UPDATE/DELETE blocked from clients
-- (resolution writes happen via SECURITY DEFINER edge functions)
CREATE POLICY "h1 vouches: read own"
  ON public.ktrenz_h1_vouches
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "h1 vouches: insert own"
  ON public.ktrenz_h1_vouches
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "h1 vouches: update own (confidence change)"
  ON public.ktrenz_h1_vouches
  FOR UPDATE
  USING (auth.uid() = user_id AND resolved = false)
  WITH CHECK (auth.uid() = user_id);

-- resolution: read by all authenticated
CREATE POLICY "h1 resolution readable"
  ON public.ktrenz_h1_resolution
  FOR SELECT
  USING (true);

-- leaderboard: read by all authenticated
CREATE POLICY "h1 leaderboard readable"
  ON public.ktrenz_h1_leaderboard_daily
  FOR SELECT
  USING (true);

-- ─── RPCs ─────────────────────────────────────────────────────────────

-- Records (or updates) a vouch for the given content item. Lazy-creates the
-- corresponding drop row if no curation has run for today yet — once P3's
-- curation cron is live, drops will be pre-populated and this lazy path
-- becomes a no-op for known items.
CREATE OR REPLACE FUNCTION public.ktrenz_h1_record_vouch(
  _item_id UUID,
  _confidence TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID := auth.uid();
  _drop_date DATE := current_date;
  _region TEXT := 'global';
  _drop_id UUID;
  _next_rank INT;
  _vouch_id UUID;
  _vouched_count INT;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF _confidence NOT IN ('low', 'mid', 'high') THEN
    RAISE EXCEPTION 'Invalid confidence value: %', _confidence USING ERRCODE = '22023';
  END IF;

  -- Find or create the drop row for today/region/item
  SELECT id INTO _drop_id
  FROM public.ktrenz_h1_daily_drop
  WHERE drop_date = _drop_date AND region = _region AND item_id = _item_id;

  IF _drop_id IS NULL THEN
    SELECT COALESCE(MAX(cohort_rank), 0) + 1 INTO _next_rank
    FROM public.ktrenz_h1_daily_drop
    WHERE drop_date = _drop_date AND region = _region;

    INSERT INTO public.ktrenz_h1_daily_drop
      (drop_date, region, item_id, cohort_rank, resolution_at)
    VALUES
      (_drop_date, _region, _item_id, _next_rank, (_drop_date + INTERVAL '7 days')::TIMESTAMPTZ)
    RETURNING id INTO _drop_id;
  END IF;

  -- Upsert vouch (user can change confidence until resolution)
  INSERT INTO public.ktrenz_h1_vouches (user_id, drop_id, confidence)
  VALUES (_user_id, _drop_id, _confidence)
  ON CONFLICT (user_id, drop_id) DO UPDATE
    SET confidence = EXCLUDED.confidence,
        vouched_at = now()
  WHERE public.ktrenz_h1_vouches.resolved = false
  RETURNING id INTO _vouch_id;

  -- If the vouch already resolved, the upsert above is suppressed by the
  -- WHERE clause and _vouch_id stays NULL — re-fetch to return the existing.
  IF _vouch_id IS NULL THEN
    SELECT id INTO _vouch_id
    FROM public.ktrenz_h1_vouches
    WHERE user_id = _user_id AND drop_id = _drop_id;
  END IF;

  -- Today's vouched count for quota status
  SELECT COUNT(*) INTO _vouched_count
  FROM public.ktrenz_h1_vouches v
  JOIN public.ktrenz_h1_daily_drop d ON d.id = v.drop_id
  WHERE v.user_id = _user_id AND d.drop_date = _drop_date AND d.region = _region;

  RETURN jsonb_build_object(
    'vouch_id', _vouch_id,
    'drop_id', _drop_id,
    'item_id', _item_id,
    'confidence', _confidence,
    'vouched_count', _vouched_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ktrenz_h1_record_vouch(UUID, TEXT) TO authenticated;

-- Returns the current user's vouches for today's drop, keyed by item_id so
-- the client can re-hydrate state on mount without an extra join.
CREATE OR REPLACE FUNCTION public.ktrenz_h1_my_today_vouches()
RETURNS TABLE (item_id UUID, confidence TEXT, vouched_at TIMESTAMPTZ)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT d.item_id, v.confidence, v.vouched_at
  FROM public.ktrenz_h1_vouches v
  JOIN public.ktrenz_h1_daily_drop d ON d.id = v.drop_id
  WHERE v.user_id = auth.uid()
    AND d.drop_date = current_date
    AND d.region = 'global'
$$;

GRANT EXECUTE ON FUNCTION public.ktrenz_h1_my_today_vouches() TO authenticated;
