-- Hot Vote persistence — capture user-marked content cards as a per-item
-- "this item is fueling the trend" signal. Previously this lived in client
-- state only and was discarded on refresh, wasting the most valuable kind of
-- signal we collect (micro-level trend driver attribution).

CREATE TABLE public.ktrenz_b2_hot_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.ktrenz_b2_items(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES public.ktrenz_b2_runs(id) ON DELETE CASCADE,
  star_id UUID NOT NULL,
  voted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_id)
);

-- Common access patterns:
--   1) "load my votes for these run_ids" on Battle page mount → user_id+run_id
--   2) "how many votes does this item have" for B2B aggregates → item_id
--   3) "trend driver leaderboard for this run" → run_id
CREATE INDEX idx_b2_hot_votes_user_run ON public.ktrenz_b2_hot_votes (user_id, run_id);
CREATE INDEX idx_b2_hot_votes_item ON public.ktrenz_b2_hot_votes (item_id);
CREATE INDEX idx_b2_hot_votes_run ON public.ktrenz_b2_hot_votes (run_id);

ALTER TABLE public.ktrenz_b2_hot_votes ENABLE ROW LEVEL SECURITY;

-- Users see and manage only their own votes. Aggregate analytics will go
-- through service-role views when B2B productization lands.
CREATE POLICY "Users manage own hot votes"
  ON public.ktrenz_b2_hot_votes
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- Toggle RPC — single-call atomic toggle that resolves item→run/star
-- denormalization server-side so the client doesn't need to ship those.
-- Returns true if the vote is now ON, false if removed.
CREATE OR REPLACE FUNCTION public.ktrenz_toggle_hot_vote(p_item_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID := auth.uid();
  _existing_id UUID;
  _run_id UUID;
  _star_id UUID;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  SELECT id INTO _existing_id
  FROM ktrenz_b2_hot_votes
  WHERE user_id = _user_id AND item_id = p_item_id;

  IF _existing_id IS NOT NULL THEN
    DELETE FROM ktrenz_b2_hot_votes WHERE id = _existing_id;
    RETURN false;
  END IF;

  SELECT run_id, star_id INTO _run_id, _star_id
  FROM ktrenz_b2_items
  WHERE id = p_item_id;

  IF _run_id IS NULL THEN
    RAISE EXCEPTION 'item not found';
  END IF;

  INSERT INTO ktrenz_b2_hot_votes (user_id, item_id, run_id, star_id)
  VALUES (_user_id, p_item_id, _run_id, _star_id);

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ktrenz_toggle_hot_vote(UUID) TO authenticated;
