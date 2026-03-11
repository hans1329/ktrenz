
-- Geo change signals: stores per-source, per-country change rates and spike flags
CREATE TABLE public.ktrenz_geo_change_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wiki_entry_id UUID NOT NULL REFERENCES public.wiki_entries(id) ON DELETE CASCADE,
  country_code TEXT NOT NULL,
  country_name TEXT NOT NULL,
  source TEXT NOT NULL,  -- 'google_trends', 'lastfm', 'youtube_comments'
  
  -- Current vs previous values
  current_value NUMERIC NOT NULL DEFAULT 0,
  previous_value NUMERIC,
  change_rate NUMERIC,  -- percentage change: (current - previous) / previous * 100
  
  -- Spike detection
  is_spike BOOLEAN NOT NULL DEFAULT false,  -- true if |change_rate| > threshold
  spike_direction TEXT,  -- 'surge' or 'drop' or null
  
  -- Context
  current_rank INTEGER,
  previous_rank INTEGER,
  rank_change INTEGER,  -- positive = improved, negative = dropped
  
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  window_hours INTEGER NOT NULL DEFAULT 24  -- comparison window
);

-- Index for fast lookups
CREATE INDEX idx_geo_change_signals_artist ON public.ktrenz_geo_change_signals(wiki_entry_id, detected_at DESC);
CREATE INDEX idx_geo_change_signals_spikes ON public.ktrenz_geo_change_signals(is_spike, detected_at DESC) WHERE is_spike = true;

-- RLS
ALTER TABLE public.ktrenz_geo_change_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on geo_change_signals"
  ON public.ktrenz_geo_change_signals
  FOR SELECT
  TO authenticated
  USING (true);
