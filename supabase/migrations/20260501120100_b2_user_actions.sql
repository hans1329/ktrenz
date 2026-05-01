-- User action telemetry — uniform log of meaningful Battle interactions.
-- Existing tables (b2_predictions, b2_hot_votes, engagement) capture WHAT the
-- user committed to. This captures the FUNNEL: visit → pick → analyze →
-- submit, including abandons and timing — required for retention/conversion
-- analytics, A/B tests, and B2B "engaged user" segmentation later.
--
-- Insert-only from clients. B2B/analytics reads exclusively via service role.

CREATE TABLE public.ktrenz_b2_user_actions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  battle_date DATE,
  run_id UUID,
  star_id UUID,
  pair_idx INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_actions_user_time ON public.ktrenz_b2_user_actions (user_id, occurred_at DESC);
CREATE INDEX idx_user_actions_type_time ON public.ktrenz_b2_user_actions (action_type, occurred_at DESC);
CREATE INDEX idx_user_actions_battle_date ON public.ktrenz_b2_user_actions (battle_date) WHERE battle_date IS NOT NULL;

ALTER TABLE public.ktrenz_b2_user_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own actions"
  ON public.ktrenz_b2_user_actions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- No SELECT policy: clients cannot read. Analytics goes through service role.
