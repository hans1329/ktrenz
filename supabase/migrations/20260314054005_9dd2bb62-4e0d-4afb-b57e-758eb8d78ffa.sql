
-- ══════ Signal-A: Event Label ══════
CREATE TABLE ktrenz_artist_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wiki_entry_id uuid NOT NULL REFERENCES wiki_entries(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'comeback', 'mv_release', 'album_release', 'festival',
    'variety_show', 'award_show', 'viral_moment', 'scandal', 'concert_tour'
  )),
  event_date date NOT NULL,
  event_title text NOT NULL,
  source_url text,
  impact_window_days int NOT NULL DEFAULT 7,
  labeled_by text NOT NULL DEFAULT 'admin' CHECK (labeled_by IN ('admin', 'ai_auto', 'fan_report')),
  verified boolean NOT NULL DEFAULT false,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_artist_events_entry ON ktrenz_artist_events(wiki_entry_id);
CREATE INDEX idx_artist_events_date ON ktrenz_artist_events(event_date DESC);
CREATE INDEX idx_artist_events_type ON ktrenz_artist_events(event_type);

ALTER TABLE ktrenz_artist_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on artist_events"
  ON ktrenz_artist_events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated read artist_events"
  ON ktrenz_artist_events FOR SELECT TO authenticated USING (true);

-- ══════ Signal-B: Fandom Pulse ══════
CREATE TABLE ktrenz_fandom_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wiki_entry_id uuid NOT NULL REFERENCES wiki_entries(id) ON DELETE CASCADE,
  signal_date date NOT NULL,
  total_queries int NOT NULL DEFAULT 0,
  unique_users int NOT NULL DEFAULT 0,
  intent_distribution jsonb NOT NULL DEFAULT '{}',
  sentiment_avg numeric DEFAULT 0,
  sentiment_distribution jsonb NOT NULL DEFAULT '{}',
  hot_topics jsonb NOT NULL DEFAULT '[]',
  avg_session_depth numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (wiki_entry_id, signal_date)
);

CREATE INDEX idx_fandom_signals_date ON ktrenz_fandom_signals(signal_date DESC);
CREATE INDEX idx_fandom_signals_entry ON ktrenz_fandom_signals(wiki_entry_id);

ALTER TABLE ktrenz_fandom_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on fandom_signals"
  ON ktrenz_fandom_signals FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated read fandom_signals"
  ON ktrenz_fandom_signals FOR SELECT TO authenticated USING (true);

-- ══════ Signal-C: Attention Map ══════
CREATE TABLE ktrenz_attention_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wiki_entry_id uuid NOT NULL REFERENCES wiki_entries(id) ON DELETE CASCADE,
  signal_date date NOT NULL,
  treemap_clicks int NOT NULL DEFAULT 0,
  detail_views int NOT NULL DEFAULT 0,
  detail_sections jsonb NOT NULL DEFAULT '{}',
  external_link_clicks int NOT NULL DEFAULT 0,
  ranking_card_clicks int NOT NULL DEFAULT 0,
  unique_viewers int NOT NULL DEFAULT 0,
  avg_dwell_sections numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (wiki_entry_id, signal_date)
);

CREATE INDEX idx_attention_signals_date ON ktrenz_attention_signals(signal_date DESC);
CREATE INDEX idx_attention_signals_entry ON ktrenz_attention_signals(wiki_entry_id);

ALTER TABLE ktrenz_attention_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on attention_signals"
  ON ktrenz_attention_signals FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated read attention_signals"
  ON ktrenz_attention_signals FOR SELECT TO authenticated USING (true);
