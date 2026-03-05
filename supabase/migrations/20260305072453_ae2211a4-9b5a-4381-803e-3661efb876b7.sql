
-- Multi-agent slots table
CREATE TABLE public.ktrenz_agent_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slot_index smallint NOT NULL DEFAULT 0,
  artist_name text,
  wiki_entry_id uuid REFERENCES public.wiki_entries(id),
  avatar_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, slot_index)
);

ALTER TABLE public.ktrenz_agent_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own slots" ON public.ktrenz_agent_slots
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own slots" ON public.ktrenz_agent_slots
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own slots" ON public.ktrenz_agent_slots
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own slots" ON public.ktrenz_agent_slots
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Add agent_slot_id to messages table for per-agent chat history
ALTER TABLE public.ktrenz_fan_agent_messages
  ADD COLUMN agent_slot_id uuid REFERENCES public.ktrenz_agent_slots(id) ON DELETE CASCADE;

-- Add agent_slot_id to agent profiles for per-slot avatars
ALTER TABLE public.ktrenz_agent_profiles
  ADD COLUMN agent_slot_id uuid REFERENCES public.ktrenz_agent_slots(id) ON DELETE CASCADE;

-- Purchased extra agent slots tracking
CREATE TABLE public.ktrenz_agent_slot_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  point_cost int NOT NULL DEFAULT 1000,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ktrenz_agent_slot_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own purchases" ON public.ktrenz_agent_slot_purchases
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own purchases" ON public.ktrenz_agent_slot_purchases
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- RPC to get max allowed agent slots for a user
CREATE OR REPLACE FUNCTION public.ktrenz_get_agent_slot_limit(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tier_name text;
  _base_slots int;
  _purchased_slots int;
BEGIN
  -- Get user's K-Pass tier
  SELECT t.name INTO _tier_name
  FROM kpass_subscriptions s
  JOIN kpass_tiers t ON t.id = s.tier_id
  WHERE s.user_id = _user_id AND s.status = 'active'
  ORDER BY t.sort_order DESC
  LIMIT 1;

  -- Base slots by tier: Free=1, Basic=2, Pro=3, Premium=5
  _base_slots := CASE
    WHEN _tier_name = 'Premium' THEN 5
    WHEN _tier_name = 'Pro' THEN 3
    WHEN _tier_name = 'Basic' THEN 2
    ELSE 1
  END;

  -- Count purchased slots
  SELECT COALESCE(COUNT(*), 0) INTO _purchased_slots
  FROM ktrenz_agent_slot_purchases
  WHERE user_id = _user_id;

  RETURN jsonb_build_object(
    'tier', COALESCE(_tier_name, 'Free'),
    'base_slots', _base_slots,
    'purchased_slots', _purchased_slots,
    'total_slots', _base_slots + _purchased_slots
  );
END;
$$;

-- RPC to purchase an agent slot with points
CREATE OR REPLACE FUNCTION public.ktrenz_purchase_agent_slot(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _points int;
  _cost int := 1000;
BEGIN
  -- Check points
  SELECT COALESCE(points, 0) INTO _points
  FROM ktrenz_user_points
  WHERE user_id = _user_id;

  IF _points < _cost THEN
    RETURN jsonb_build_object('success', false, 'reason', 'insufficient_points');
  END IF;

  -- Deduct points
  UPDATE ktrenz_user_points
  SET points = points - _cost, updated_at = now()
  WHERE user_id = _user_id;

  -- Record transaction
  INSERT INTO ktrenz_point_transactions (user_id, points, reason, description)
  VALUES (_user_id, -_cost, 'agent_slot_purchase', 'Additional agent slot');

  -- Record purchase
  INSERT INTO ktrenz_agent_slot_purchases (user_id, point_cost)
  VALUES (_user_id, _cost);

  RETURN jsonb_build_object('success', true);
END;
$$;
