-- Bump ad-unlock daily cap from 2 → 5.
-- Client gates additional usage to "remaining unvouched cards" so cohorts
-- smaller than 12 don't strand wasted unlocks. Server keeps the hard cap.

CREATE OR REPLACE FUNCTION public.ktrenz_h1_record_ad_unlock(_tier TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id      UUID := auth.uid();
  _total_today  INT;
  _max_per_day  INT := 5;
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

-- Patch my_status to reflect the new max_per_day (was hardcoded 2).
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
    'max_per_day',  5,
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
