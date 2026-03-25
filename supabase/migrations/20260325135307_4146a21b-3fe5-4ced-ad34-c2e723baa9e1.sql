CREATE TABLE public.ktrenz_schedule_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wiki_entry_id uuid REFERENCES public.wiki_entries(id) ON DELETE CASCADE NOT NULL,
  star_id uuid REFERENCES public.ktrenz_stars(id),
  event_title text NOT NULL,
  event_date date,
  event_date_end date,
  category text NOT NULL DEFAULT 'event',
  confidence numeric NOT NULL DEFAULT 0.5,
  reasoning text,
  source_headlines jsonb DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);

ALTER TABLE public.ktrenz_schedule_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read schedule predictions"
  ON public.ktrenz_schedule_predictions FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Service role can manage schedule predictions"
  ON public.ktrenz_schedule_predictions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_ktrenz_schedule_pred_wiki ON public.ktrenz_schedule_predictions(wiki_entry_id);
CREATE INDEX idx_ktrenz_schedule_pred_status ON public.ktrenz_schedule_predictions(status, expires_at);
CREATE INDEX idx_ktrenz_schedule_pred_confidence ON public.ktrenz_schedule_predictions(confidence DESC);