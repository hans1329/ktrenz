
CREATE TABLE public.ktrenz_geo_fan_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wiki_entry_id UUID NOT NULL REFERENCES public.wiki_entries(id) ON DELETE CASCADE,
  country_code TEXT NOT NULL,
  country_name TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'lastfm',
  rank_position INTEGER,
  listeners INTEGER,
  interest_score NUMERIC DEFAULT 0,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(wiki_entry_id, country_code, source, collected_at)
);

CREATE INDEX idx_ktrenz_geo_fan_data_artist ON public.ktrenz_geo_fan_data(wiki_entry_id);
CREATE INDEX idx_ktrenz_geo_fan_data_collected ON public.ktrenz_geo_fan_data(collected_at DESC);

ALTER TABLE public.ktrenz_geo_fan_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read for authenticated" ON public.ktrenz_geo_fan_data
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow service role full access" ON public.ktrenz_geo_fan_data
  FOR ALL TO service_role USING (true) WITH CHECK (true);
