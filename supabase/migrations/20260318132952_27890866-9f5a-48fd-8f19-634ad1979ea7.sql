
-- Keyword votes table for T2 trend keywords
CREATE TABLE public.ktrenz_keyword_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id uuid NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  vote_type text NOT NULL CHECK (vote_type IN ('up', 'down')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(trigger_id, user_id)
);

-- RLS
ALTER TABLE public.ktrenz_keyword_votes ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read vote counts
CREATE POLICY "Authenticated users can read votes"
  ON public.ktrenz_keyword_votes FOR SELECT
  TO authenticated
  USING (true);

-- Users can insert their own votes
CREATE POLICY "Users can insert own votes"
  ON public.ktrenz_keyword_votes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own votes
CREATE POLICY "Users can update own votes"
  ON public.ktrenz_keyword_votes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own votes
CREATE POLICY "Users can delete own votes"
  ON public.ktrenz_keyword_votes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Keyword boost tracking table
CREATE TABLE public.ktrenz_keyword_boosts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id uuid NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  platform text NOT NULL DEFAULT 'twitter',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ktrenz_keyword_boosts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read boosts"
  ON public.ktrenz_keyword_boosts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own boosts"
  ON public.ktrenz_keyword_boosts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Index for fast aggregation
CREATE INDEX idx_keyword_votes_trigger ON public.ktrenz_keyword_votes(trigger_id);
CREATE INDEX idx_keyword_boosts_trigger ON public.ktrenz_keyword_boosts(trigger_id);
