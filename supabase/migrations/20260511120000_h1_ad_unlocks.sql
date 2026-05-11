-- H1 ad-unlock slot grants.
--
-- Mechanic: user finishes their daily 7 slots (1+4+2) → wants more bets on
-- the same 24-card cohort. Watching a (simulated for now) 30s ad grants +1
-- slot in the chosen tier (mid or high). Daily cap = 2 unlocks per user.
--
-- Why mid/high only: low (×1) is the climb-back-from-broke tier — not
-- gameplay constrained. Mid (×2) + high (×4) caps at 4 + 2 are the real
-- bottleneck users hit at end of day.
--
-- The unlock is _additive_ to the base cap — record_vouch RPC reads
-- ktrenz_h1_ad_unlocks_today(user, tier) and adds it to the slot cap before
-- gating the next vouch.

CREATE TABLE IF NOT EXISTS public.ktrenz_h1_ad_unlocks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier        TEXT        NOT NULL CHECK (tier IN ('mid', 'high')),
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_h1_ad_unlocks_user_time
  ON public.ktrenz_h1_ad_unlocks (user_id, unlocked_at DESC);

ALTER TABLE public.ktrenz_h1_ad_unlocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "h1 ad_unlocks: read own" ON public.ktrenz_h1_ad_unlocks;
CREATE POLICY "h1 ad_unlocks: read own"
  ON public.ktrenz_h1_ad_unlocks
  FOR SELECT
  USING (auth.uid() = user_id);

-- Per-tier count of today's unlocks (UTC date).
CREATE OR REPLACE FUNCTION public.ktrenz_h1_ad_unlocks_today(_user_id UUID, _tier TEXT)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INT
  FROM public.ktrenz_h1_ad_unlocks
  WHERE user_id = _user_id
    AND tier = _tier
    AND unlocked_at >= current_date::TIMESTAMPTZ
$$;

GRANT EXECUTE ON FUNCTION public.ktrenz_h1_ad_unlocks_today(UUID, TEXT) TO authenticated;

-- Total today (any tier) — used for daily cap enforcement.
CREATE OR REPLACE FUNCTION public.ktrenz_h1_ad_unlocks_total_today(_user_id UUID)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INT
  FROM public.ktrenz_h1_ad_unlocks
  WHERE user_id = _user_id
    AND unlocked_at >= current_date::TIMESTAMPTZ
$$;

GRANT EXECUTE ON FUNCTION public.ktrenz_h1_ad_unlocks_total_today(UUID) TO authenticated;

-- Record an ad unlock — called by client after the 30s ad placeholder
-- completes. Caps at 2 unlocks per UTC day.
CREATE OR REPLACE FUNCTION public.ktrenz_h1_record_ad_unlock(_tier TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id      UUID := auth.uid();
  _total_today  INT;
  _max_per_day  INT := 2;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF _tier NOT IN ('mid', 'high') THEN
    RAISE EXCEPTION 'AD_UNLOCK_INVALID_TIER: tier must be mid or high (got %)', _tier
      USING ERRCODE = '22023';
  END IF;

  SELECT public.ktrenz_h1_ad_unlocks_total_today(_user_id) INTO _total_today;
  IF _total_today >= _max_per_day THEN
    RAISE EXCEPTION 'AD_UNLOCK_DAILY_CAP: % per day already used', _max_per_day
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.ktrenz_h1_ad_unlocks (user_id, tier) VALUES (_user_id, _tier);

  RETURN jsonb_build_object(
    'tier', _tier,
    'unlocks_today', _total_today + 1,
    'max_per_day', _max_per_day,
    'tier_unlocks', public.ktrenz_h1_ad_unlocks_today(_user_id, _tier)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ktrenz_h1_record_ad_unlock(TEXT) TO authenticated;

-- Patch ktrenz_h1_record_vouch — slot cap now = base cap + ad unlocks today.
-- Re-creates the function to swap the slot count check.
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
  _ad_unlocks INT;
  _balance INT;
  _vouched_count INT;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF _confidence NOT IN ('low', 'mid', 'high') THEN
    RAISE EXCEPTION 'Invalid confidence value: %', _confidence USING ERRCODE = '22023';
  END IF;

  -- Effective slot cap = base + ad unlocks for this tier today.
  _slot_cap := public.ktrenz_h1_slot_cap(_confidence);
  IF _confidence IN ('mid', 'high') THEN
    _ad_unlocks := public.ktrenz_h1_ad_unlocks_today(_user_id, _confidence);
    _slot_cap := _slot_cap + _ad_unlocks;
  END IF;

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

  -- Find this item across ALL open rounds (most recent first).
  SELECT id, drop_date INTO _drop_id, _drop_date
  FROM public.ktrenz_h1_daily_drop
  WHERE region = _region
    AND item_id = _item_id
    AND resolved = false
  ORDER BY drop_date DESC
  LIMIT 1;

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

  -- Daily slot cap = base + unlocks. Count today's actions of this tier
  -- (any drop), excluding the row we're about to upsert.
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

  -- Upsert vouch
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

-- Patch ktrenz_h1_my_status — return effective caps including ad unlocks.
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
  _ad_unlocks JSONB;
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
  -- when the vouch was last touched (vouched_at). Cap is base + unlocks.
  WITH used AS (
    SELECT v.confidence, COUNT(*) AS n
    FROM public.ktrenz_h1_vouches v
    WHERE v.user_id = _user_id
      AND v.vouched_at >= _today::TIMESTAMPTZ
    GROUP BY v.confidence
  )
  SELECT jsonb_build_object(
    'low',  jsonb_build_object(
              'used', COALESCE((SELECT n FROM used WHERE confidence='low'),  0),
              'cap',  public.ktrenz_h1_slot_cap('low')
            ),
    'mid',  jsonb_build_object(
              'used', COALESCE((SELECT n FROM used WHERE confidence='mid'),  0),
              'cap',  public.ktrenz_h1_slot_cap('mid')  + public.ktrenz_h1_ad_unlocks_today(_user_id, 'mid')
            ),
    'high', jsonb_build_object(
              'used', COALESCE((SELECT n FROM used WHERE confidence='high'), 0),
              'cap',  public.ktrenz_h1_slot_cap('high') + public.ktrenz_h1_ad_unlocks_today(_user_id, 'high')
            )
  ) INTO _slots;

  SELECT jsonb_build_object(
    'used',         public.ktrenz_h1_ad_unlocks_total_today(_user_id),
    'max_per_day',  2,
    'mid',          public.ktrenz_h1_ad_unlocks_today(_user_id, 'mid'),
    'high',         public.ktrenz_h1_ad_unlocks_today(_user_id, 'high')
  ) INTO _ad_unlocks;

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
    'ad_unlocks', _ad_unlocks,
    'drip', jsonb_build_object(
      'claimed_today', _drip_claimed_today,
      'eligible', (NOT _drip_claimed_today) AND _vouched_yesterday,
      'amount', 10
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ktrenz_h1_my_status() TO authenticated;
