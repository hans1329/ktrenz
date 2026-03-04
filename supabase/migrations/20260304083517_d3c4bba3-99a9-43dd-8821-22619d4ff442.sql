CREATE TABLE public.ktrenz_daily_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wiki_entry_id uuid NOT NULL,
  mission_key text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  mission_date date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  points_awarded integer NOT NULL DEFAULT 0,
  UNIQUE(user_id, wiki_entry_id, mission_key, mission_date)
);

ALTER TABLE public.ktrenz_daily_missions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own missions" ON public.ktrenz_daily_missions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own missions" ON public.ktrenz_daily_missions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_daily_missions_user_date ON public.ktrenz_daily_missions(user_id, mission_date);
CREATE INDEX idx_daily_missions_artist_date ON public.ktrenz_daily_missions(wiki_entry_id, mission_date);