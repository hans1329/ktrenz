-- H1 multi-round editing — let users update predictions on any open round,
-- not just today's. The 7-day resolution window becomes a "modify daily,
-- watch how rank shifts" surface instead of a frozen snap-decision.
--
-- Game-design changes (decided 2026-05-10):
-- - Remove time_decay (×3 / ×1 / ×0.3) — early-bird advantage didn't fit
--   the snap-judgment model and never actually fired (record_vouch only
--   accepted today's drop pre-fix).
-- - Daily slot cap = today's vouch ACTIONS across all open rounds, not
--   per-round. Aligns with "1 daily ritual, spread across active picks".
-- - record_vouch can now target any non-resolved drop containing the item.
-- - New RPC ktrenz_h1_my_active_picks for the "your picks across all open
--   rounds" UI strip with current cohort rank.

-- ─── record_vouch — accepts any open round ────────────────────────────

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
  _today DATE := current_date;
  _region TEXT := 'global';
  _drop_id UUID;
  _drop_date DATE;
  _next_rank INT;
  _vouch_id UUID;
  _new_tier_count INT;
  _slot_cap INT;
  _balance INT;
  _vouched_count INT;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF _confidence NOT IN ('low', 'mid', 'high') THEN
    RAISE EXCEPTION 'Invalid confidence value: %', _confidence USING ERRCODE = '22023';
  END IF;

  _slot_cap := public.ktrenz_h1_slot_cap(_confidence);

  -- Balance gate (mid/high require positive K-Cash)
  IF _confidence IN ('mid', 'high') THEN
    SELECT COALESCE(points, 0) INTO _balance
    FROM public.ktrenz_user_points
    WHERE user_id = _user_id;

    IF COALESCE(_balance, 0) <= 0 THEN
      RAISE EXCEPTION 'INSUFFICIENT_BALANCE: % requires K-Cash > 0 (current: %)',
        _confidence, COALESCE(_balance, 0)
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Find this item across ALL open rounds (most recent first). Lets the
  -- user vouch / re-vouch on any active round, not only today's.
  SELECT id, drop_date INTO _drop_id, _drop_date
  FROM public.ktrenz_h1_daily_drop
  WHERE region = _region
    AND item_id = _item_id
    AND resolved = false
  ORDER BY drop_date DESC
  LIMIT 1;

  -- If item isn't in any open round, lazy-create today's drop entry
  -- (only when today's cohort has room — preserves the 24-cap).
  IF _drop_id IS NULL THEN
    SELECT COALESCE(MAX(cohort_rank), 0) + 1 INTO _next_rank
    FROM public.ktrenz_h1_daily_drop
    WHERE drop_date = _today AND region = _region;

    IF _next_rank > 24 THEN
      RAISE EXCEPTION 'COHORT_FULL: today''s slate is already at 24'
        USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.ktrenz_h1_daily_drop
      (drop_date, region, item_id, cohort_rank, resolution_at)
    VALUES
      (_today, _region, _item_id, _next_rank, (_today + INTERVAL '7 days')::TIMESTAMPTZ)
    RETURNING id, drop_date INTO _drop_id, _drop_date;
  END IF;

  -- Daily slot cap is by user ACTIONS today, regardless of which round.
  -- If a user updates a vouch today (changes tier), that counts. A vouch
  -- last touched yesterday or earlier doesn't consume today's slot.
  SELECT COUNT(*) INTO _new_tier_count
  FROM public.ktrenz_h1_vouches v
  WHERE v.user_id = _user_id
    AND v.vouched_at >= _today::TIMESTAMPTZ
    AND v.confidence = _confidence
    AND v.drop_id <> _drop_id;

  IF _new_tier_count + 1 > _slot_cap THEN
    RAISE EXCEPTION 'SLOT_CAP_EXCEEDED: % limit is %/day (already used: %)',
      _confidence, _slot_cap, _new_tier_count
      USING ERRCODE = 'P0001';
  END IF;

  -- Upsert vouch (gated to unresolved rows only)
  INSERT INTO public.ktrenz_h1_vouches (user_id, drop_id, confidence)
  VALUES (_user_id, _drop_id, _confidence)
  ON CONFLICT (user_id, drop_id) DO UPDATE
    SET confidence = EXCLUDED.confidence,
        vouched_at = now()
  WHERE public.ktrenz_h1_vouches.resolved = false
  RETURNING id INTO _vouch_id;

  IF _vouch_id IS NULL THEN
    SELECT id INTO _vouch_id
    FROM public.ktrenz_h1_vouches
    WHERE user_id = _user_id AND drop_id = _drop_id;
  END IF;

  -- Today's vouch count (any drop) — used for quota nudges
  SELECT COUNT(*) INTO _vouched_count
  FROM public.ktrenz_h1_vouches v
  JOIN public.ktrenz_h1_daily_drop d ON d.id = v.drop_id
  WHERE v.user_id = _user_id AND d.drop_date = _today AND d.region = _region;

  RETURN jsonb_build_object(
    'vouch_id', _vouch_id,
    'drop_id', _drop_id,
    'drop_date', _drop_date,
    'item_id', _item_id,
    'confidence', _confidence,
    'vouched_count', _vouched_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ktrenz_h1_record_vouch(UUID, TEXT) TO authenticated;

-- ─── ktrenz_h1_my_active_picks — past rounds with current rank ────────
--
-- Returns the user's vouches on non-resolved rounds, joined with the item
-- and a live cohort percentile so the UI can show "your pick is currently
-- #5 of 24, top 30% — still tracking hit". Computed on read because the
-- cohort score moves continuously; no need to materialize.

CREATE OR REPLACE FUNCTION public.ktrenz_h1_my_active_picks()
RETURNS TABLE (
  vouch_id           UUID,
  drop_id            UUID,
  drop_date          DATE,
  resolution_at      TIMESTAMPTZ,
  item_id            UUID,
  confidence         TEXT,
  vouched_at         TIMESTAMPTZ,
  current_rank       INT,
  cohort_size        INT,
  is_provisional_hit BOOL,
  title              TEXT,
  thumbnail          TEXT,
  source             TEXT,
  star_display_name  TEXT,
  star_image_url     TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  _user_id UUID := auth.uid();
BEGIN
  IF _user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH my_open AS (
    SELECT v.id AS vouch_id, v.drop_id, v.confidence, v.vouched_at, d.drop_date,
           d.region, d.resolution_at, d.item_id
    FROM public.ktrenz_h1_vouches v
    JOIN public.ktrenz_h1_daily_drop d ON d.id = v.drop_id
    WHERE v.user_id = _user_id
      AND v.resolved = false
      AND d.resolved = false
  ),
  cohort_ranks AS (
    -- Within each (drop_date, region) cohort, rank items by current
    -- engagement_score so we can tell the user where their pick sits.
    SELECT
      d.id AS drop_id,
      d.drop_date,
      d.region,
      DENSE_RANK() OVER (
        PARTITION BY d.drop_date, d.region
        ORDER BY COALESCE(b.engagement_score, 0) DESC
      ) AS current_rank,
      COUNT(*) OVER (PARTITION BY d.drop_date, d.region) AS cohort_size
    FROM public.ktrenz_h1_daily_drop d
    JOIN public.ktrenz_b2_items b ON b.id = d.item_id
    WHERE d.resolved = false
      AND (d.drop_date, d.region) IN (
        SELECT drop_date, region FROM my_open
      )
  )
  SELECT
    mo.vouch_id,
    mo.drop_id,
    mo.drop_date,
    mo.resolution_at,
    mo.item_id,
    mo.confidence,
    mo.vouched_at,
    cr.current_rank::INT,
    cr.cohort_size::INT,
    (cr.current_rank::NUMERIC / NULLIF(cr.cohort_size, 0)) <= 0.3 AS is_provisional_hit,
    b.title,
    b.thumbnail,
    b.source,
    s.display_name AS star_display_name,
    s.image_url AS star_image_url
  FROM my_open mo
  JOIN cohort_ranks cr
    ON cr.drop_id = mo.drop_id
  JOIN public.ktrenz_b2_items b ON b.id = mo.item_id
  LEFT JOIN public.ktrenz_stars s ON s.id = b.star_id
  ORDER BY mo.drop_date DESC, mo.vouched_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ktrenz_h1_my_active_picks() TO authenticated;

-- ─── ktrenz_h1_my_status — extend to include today's slot usage ───────
--
-- The slot accounting moved from drop_date-based to vouched_at-based.
-- Re-create the status RPC so the UI counter reflects the same.

CREATE OR REPLACE FUNCTION public.ktrenz_h1_my_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  _user_id UUID := auth.uid();
  _today DATE := current_date;
  _balance INT;
  _slots JSONB;
  _drip_claimed_today BOOL;
  _vouched_yesterday BOOL;
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('signed_in', false);
  END IF;

  SELECT COALESCE(points, 0) INTO _balance
  FROM public.ktrenz_user_points
  WHERE user_id = _user_id;
  _balance := COALESCE(_balance, 0);

  -- Slot usage today by tier — counted across ALL open rounds based on
  -- when the vouch was last touched (vouched_at).
  WITH used AS (
    SELECT v.confidence, COUNT(*) AS n
    FROM public.ktrenz_h1_vouches v
    WHERE v.user_id = _user_id
      AND v.vouched_at >= _today::TIMESTAMPTZ
    GROUP BY v.confidence
  )
  SELECT jsonb_build_object(
    'low',  jsonb_build_object('used', COALESCE((SELECT n FROM used WHERE confidence='low'),  0), 'cap', public.ktrenz_h1_slot_cap('low')),
    'mid',  jsonb_build_object('used', COALESCE((SELECT n FROM used WHERE confidence='mid'),  0), 'cap', public.ktrenz_h1_slot_cap('mid')),
    'high', jsonb_build_object('used', COALESCE((SELECT n FROM used WHERE confidence='high'), 0), 'cap', public.ktrenz_h1_slot_cap('high'))
  ) INTO _slots;

  SELECT EXISTS (
    SELECT 1 FROM public.ktrenz_point_transactions
    WHERE user_id = _user_id
      AND reason = 'h1_drip'
      AND created_at >= _today::TIMESTAMPTZ
      AND created_at <  (_today + INTERVAL '1 day')::TIMESTAMPTZ
  ) INTO _drip_claimed_today;

  SELECT EXISTS (
    SELECT 1
    FROM public.ktrenz_h1_vouches v
    JOIN public.ktrenz_h1_daily_drop d ON d.id = v.drop_id
    WHERE v.user_id = _user_id
      AND d.drop_date = _today - INTERVAL '1 day'
      AND d.region = 'global'
  ) INTO _vouched_yesterday;

  RETURN jsonb_build_object(
    'signed_in', true,
    'balance', _balance,
    'slots', _slots,
    'drip', jsonb_build_object(
      'claimed_today', _drip_claimed_today,
      'eligible', (NOT _drip_claimed_today) AND _vouched_yesterday,
      'amount', 10
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ktrenz_h1_my_status() TO authenticated;
