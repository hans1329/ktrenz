-- K-Points packages (admin-managed)
CREATE TABLE IF NOT EXISTS ktrenz_point_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_key text NOT NULL UNIQUE,
  label text NOT NULL,
  points integer NOT NULL,
  price_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  stripe_price_id text NOT NULL,
  bonus_label text,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ktrenz_point_packages ENABLE ROW LEVEL SECURITY;

-- Anyone can read active packages
CREATE POLICY "Public read active packages"
  ON ktrenz_point_packages FOR SELECT
  USING (is_active = true);

-- Seed initial packages
INSERT INTO ktrenz_point_packages (package_key, label, points, price_cents, currency, stripe_price_id, bonus_label, display_order) VALUES
  ('100', 'Starter', 100, 100, 'usd', 'price_1T7YL9DVBCKJG9PoTggpW8y8', NULL, 1),
  ('600', 'Popular', 600, 500, 'usd', 'price_1T7YLaDVBCKJG9PodU0VWcQY', '+20%', 2),
  ('1500', 'Best Value', 1500, 1000, 'usd', 'price_1T7YLtDVBCKJG9PoBtoI1fHv', '+50%', 3);