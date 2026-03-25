-- 1) Brand registry master table
CREATE TABLE ktrenz_brand_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_name text NOT NULL UNIQUE,
  brand_name_ko text,
  domain text,
  logo_url text,
  category text DEFAULT 'other',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Index for fast lookup
CREATE INDEX idx_brand_registry_name ON ktrenz_brand_registry (brand_name);
CREATE INDEX idx_brand_registry_active ON ktrenz_brand_registry (is_active) WHERE is_active = true;

-- 2) Add brand_id FK to trend triggers
ALTER TABLE ktrenz_trend_triggers
  ADD COLUMN brand_id uuid REFERENCES ktrenz_brand_registry(id);

CREATE INDEX idx_trend_triggers_brand ON ktrenz_trend_triggers (brand_id) WHERE brand_id IS NOT NULL;

-- 3) RLS: public read, authenticated insert/update
ALTER TABLE ktrenz_brand_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read brands"
  ON ktrenz_brand_registry FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated can manage brands"
  ON ktrenz_brand_registry FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);