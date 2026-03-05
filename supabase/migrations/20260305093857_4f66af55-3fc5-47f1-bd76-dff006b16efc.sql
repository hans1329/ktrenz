CREATE TABLE IF NOT EXISTS ktrenz_point_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_session_id text NOT NULL UNIQUE,
  stripe_payment_intent_id text,
  package_key text NOT NULL,
  points_amount integer NOT NULL,
  price_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE ktrenz_point_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own purchases"
  ON ktrenz_point_purchases FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_ktrenz_point_purchases_user ON ktrenz_point_purchases(user_id);
CREATE INDEX idx_ktrenz_point_purchases_session ON ktrenz_point_purchases(stripe_session_id);