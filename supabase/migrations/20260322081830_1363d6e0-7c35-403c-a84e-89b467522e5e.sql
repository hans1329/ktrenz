
CREATE TABLE public.ktrenz_agent_cards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_slot_id UUID,
  card_type TEXT NOT NULL CHECK (card_type IN ('briefing', 'trend', 'report', 'action', 'ranking', 'guide')),
  card_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ktrenz_agent_cards_message ON ktrenz_agent_cards(message_id);
CREATE INDEX idx_ktrenz_agent_cards_user_slot ON ktrenz_agent_cards(user_id, agent_slot_id);

ALTER TABLE public.ktrenz_agent_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own cards"
  ON public.ktrenz_agent_cards
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert cards"
  ON public.ktrenz_agent_cards
  FOR INSERT
  TO service_role
  WITH CHECK (true);
