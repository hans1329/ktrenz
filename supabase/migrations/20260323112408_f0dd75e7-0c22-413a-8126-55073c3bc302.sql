
-- Keyword follow/track table
CREATE TABLE public.ktrenz_keyword_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger_id uuid NOT NULL,
  keyword text NOT NULL,
  keyword_ko text,
  star_id uuid,
  artist_name text,
  last_influence_index numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, trigger_id)
);

ALTER TABLE public.ktrenz_keyword_follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own follows"
  ON public.ktrenz_keyword_follows FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own follows"
  ON public.ktrenz_keyword_follows FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own follows"
  ON public.ktrenz_keyword_follows FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_keyword_follows_user ON public.ktrenz_keyword_follows(user_id);
CREATE INDEX idx_keyword_follows_trigger ON public.ktrenz_keyword_follows(trigger_id);
