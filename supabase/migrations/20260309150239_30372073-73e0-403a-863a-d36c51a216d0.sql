CREATE TABLE public.ktrenz_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wiki_entry_id uuid REFERENCES public.wiki_entries(id) ON DELETE CASCADE,
  artist_name text NOT NULL,
  title text NOT NULL,
  event_date date NOT NULL,
  event_time text,
  category text DEFAULT 'others',
  source text DEFAULT 'blip',
  source_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(artist_name, title, event_date)
);

ALTER TABLE public.ktrenz_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read schedules"
  ON public.ktrenz_schedules FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Service role can manage schedules"
  ON public.ktrenz_schedules FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_ktrenz_schedules_wiki_entry ON public.ktrenz_schedules(wiki_entry_id);
CREATE INDEX idx_ktrenz_schedules_date ON public.ktrenz_schedules(event_date);
CREATE INDEX idx_ktrenz_schedules_artist ON public.ktrenz_schedules(artist_name);