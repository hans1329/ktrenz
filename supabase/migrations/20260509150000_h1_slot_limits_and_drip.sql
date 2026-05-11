-- H1 slot-based confidence + daily drip + balance integration
--
-- Game design (decided 2026-05-09):
-- - low confidence: 1 slot/day  (hit +5, miss -3 per weight×5)
-- - mid confidence: 4 slots/day (hit +10, miss -5)
-- - high confidence: 2 slots/day (hit +20, miss -10)
-- - mid/high require positive K-Cash balance (floor at 0)
-- - Daily drip +10 K-Cash, lazy on H1 page open, only if user vouched yesterday
-- - Welcome bonus 1000 K-Cash already granted on signup (existing flow)
--
-- Storage:
-- - Reuses ktrenz_user_points / ktrenz_point_transactions (existing K-Cash wallet)
-- - resolve-drop edge function writes h1_hit / h1_miss transactions
-- - drip writes h1_drip transactions
-- - The trg_ktrenz_credit_points trigger auto-syncs ktrenz_user_points.points

-- ─── Slot limits per tier (per drop_date) ─────────────────────────────

-- One source of truth for confidence slot caps.
CREATE OR REPLACE FUNCTION public.ktrenz_h1_slot_cap(_confidence TEXT)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _confidence
    WHEN 'low'  THEN 1
    WHEN 'mid'  THEN 4
    WHEN 'high' THEN 2
    ELSE 0
  END
$$;

-- ─── Updated record_vouch with slot + balance enforcement ─────────────

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
  _existing_confidence TEXT;
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

  -- Check K-Cash balance for risky tiers — mid/high need a positive balance
  -- to play. Broke users can still call low to climb back.
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

  -- Find or create the drop row for today/region/item
  SELECT id INTO _drop_id
  FROM public.ktrenz_h1_daily_drop
  WHERE drop_date = _drop_date AND region = _region AND item_id = _item_id;

  IF _drop_id IS NULL THEN
    -- Cohort is capped at 24 items per (drop_date, region). Reject lazy-create
    -- attempts past the cap so the drop can't inflate beyond DROP_SIZE.
    -- (Curation cron should normally fill the slate first; lazy-create only
    --  catches the edge case of pre-cron access on a fresh day.)
    SELECT COALESCE(MAX(cohort_rank), 0) + 1 INTO _next_rank
    FROM public.ktrenz_h1_daily_drop
    WHERE drop_date = _drop_date AND region = _region;

    IF _next_rank > 24 THEN
      RAISE EXCEPTION 'COHORT_FULL: today''s slate is already at 24'
        USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.ktrenz_h1_daily_drop
      (drop_date, region, item_id, cohort_rank, resolution_at)
    VALUES
      (_drop_date, _region, _item_id, _next_rank, (_drop_date + INTERVAL '7 days')::TIMESTAMPTZ)
    RETURNING id INTO _drop_id;
  END IF;

  -- If user already vouched on this drop, what's the prior tier?
  -- (so the slot accounting respects the swap rather than double-counting)
  SELECT confidence INTO _existing_confidence
  FROM public.ktrenz_h1_vouches
  WHERE user_id = _user_id AND drop_id = _drop_id;

  -- Count today's vouches at the target tier, EXCLUDING the row about to be
  -- updated if it currently sits at the same tier (would be a no-op rewrite).
  SELECT COUNT(*) INTO _new_tier_count
  FROM public.ktrenz_h1_vouches v
  JOIN public.ktrenz_h1_daily_drop d ON d.id = v.drop_id
  WHERE v.user_id = _user_id
    AND d.drop_date = _drop_date
    AND d.region = _region
    AND v.confidence = _confidence
    AND v.drop_id <> _drop_id;

  -- Adding this vouch would push the tier count to _new_tier_count + 1
  IF _new_tier_count + 1 > _slot_cap THEN
    RAISE EXCEPTION 'SLOT_CAP_EXCEEDED: % limit is %/day (already used: %)',
      _confidence, _slot_cap, _new_tier_count
      USING ERRCODE = 'P0001';
  END IF;

  -- Upsert vouch (user can change confidence until resolution)
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

  -- Today's vouched count for quota status (PRD §5 L1: 30% of 24 = 7 quota)
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

-- ─── Daily drip: +10 K-Cash, engagement-gated, lazy on read ───────────

CREATE OR REPLACE FUNCTION public.ktrenz_h1_claim_drip()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID := auth.uid();
  _today DATE := current_date;
  _yesterday DATE := current_date - INTERVAL '1 day';
  _claimed_today BOOL;
  _vouched_yesterday BOOL;
  _amount INT := 10;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Already claimed today?
  SELECT EXISTS (
    SELECT 1 FROM public.ktrenz_point_transactions
    WHERE user_id = _user_id
      AND reason = 'h1_drip'
      AND created_at >= _today::TIMESTAMPTZ
      AND created_at <  (_today + INTERVAL '1 day')::TIMESTAMPTZ
  ) INTO _claimed_today;

  IF _claimed_today THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'already_claimed_today');
  END IF;

  -- Did user vouch yesterday? (sleeper-farm guard)
  SELECT EXISTS (
    SELECT 1
    FROM public.ktrenz_h1_vouches v
    JOIN public.ktrenz_h1_daily_drop d ON d.id = v.drop_id
    WHERE v.user_id = _user_id
      AND d.drop_date = _yesterday
      AND d.region = 'global'
  ) INTO _vouched_yesterday;

  IF NOT _vouched_yesterday THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'no_activity_yesterday');
  END IF;

  -- Grant. The trg_ktrenz_credit_points trigger updates ktrenz_user_points.
  INSERT INTO public.ktrenz_point_transactions (user_id, amount, reason, description)
  VALUES (_user_id, _amount, 'h1_drip', 'H1 daily activity drip');

  RETURN jsonb_build_object('granted', true, 'amount', _amount);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ktrenz_h1_claim_drip() TO authenticated;

-- ─── UI helper: balance + today's slot usage + drip status ────────────

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

  -- Slot usage today, by tier
  WITH used AS (
    SELECT v.confidence, COUNT(*) AS n
    FROM public.ktrenz_h1_vouches v
    JOIN public.ktrenz_h1_daily_drop d ON d.id = v.drop_id
    WHERE v.user_id = _user_id
      AND d.drop_date = _today
      AND d.region = 'global'
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
