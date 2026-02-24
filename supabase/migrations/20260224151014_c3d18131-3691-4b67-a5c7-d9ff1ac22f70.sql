
-- v2 energy snapshots (separated from k-trendz.com)
CREATE TABLE public.v3_energy_snapshots_v2 (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wiki_entry_id UUID NOT NULL,
  velocity_score NUMERIC NOT NULL DEFAULT 0,
  intensity_score NUMERIC NOT NULL DEFAULT 0,
  energy_score NUMERIC NOT NULL DEFAULT 0,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_v3_energy_snapshots_v2_entry ON public.v3_energy_snapshots_v2 (wiki_entry_id, snapshot_at DESC);
ALTER TABLE public.v3_energy_snapshots_v2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read v3_energy_snapshots_v2" ON public.v3_energy_snapshots_v2 FOR SELECT USING (true);

-- v2 energy baselines
CREATE TABLE public.v3_energy_baselines_v2 (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wiki_entry_id UUID NOT NULL UNIQUE,
  avg_velocity_7d NUMERIC DEFAULT 0,
  avg_velocity_30d NUMERIC DEFAULT 0,
  avg_intensity_7d NUMERIC DEFAULT 0,
  avg_intensity_30d NUMERIC DEFAULT 0,
  avg_energy_7d NUMERIC DEFAULT 0,
  avg_energy_30d NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.v3_energy_baselines_v2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read v3_energy_baselines_v2" ON public.v3_energy_baselines_v2 FOR SELECT USING (true);

-- v2 scores (main ranking table)
CREATE TABLE public.v3_scores_v2 (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wiki_entry_id UUID NOT NULL,
  total_score NUMERIC DEFAULT 0,
  energy_score NUMERIC DEFAULT 0,
  energy_change_24h NUMERIC DEFAULT 0,
  energy_rank INTEGER DEFAULT 0,
  youtube_score NUMERIC DEFAULT 0,
  buzz_score NUMERIC DEFAULT 0,
  album_sales_score NUMERIC DEFAULT 0,
  music_score NUMERIC DEFAULT 0,
  scored_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_v3_scores_v2_entry ON public.v3_scores_v2 (wiki_entry_id, scored_at DESC);
CREATE INDEX idx_v3_scores_v2_scored_at ON public.v3_scores_v2 (scored_at DESC);
ALTER TABLE public.v3_scores_v2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read v3_scores_v2" ON public.v3_scores_v2 FOR SELECT USING (true);
