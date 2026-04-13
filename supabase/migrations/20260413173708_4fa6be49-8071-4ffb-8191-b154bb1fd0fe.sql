
-- Gift card redemption orders table
CREATE TABLE public.ktrenz_giftcard_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id bigint NOT NULL,
  product_name text NOT NULL,
  country_code text NOT NULL DEFAULT 'US',
  denomination numeric NOT NULL,
  currency_code text NOT NULL DEFAULT 'USD',
  kcash_cost integer NOT NULL,
  reloadly_transaction_id bigint,
  pin_code text,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  fulfilled_at timestamptz
);

ALTER TABLE public.ktrenz_giftcard_orders ENABLE ROW LEVEL SECURITY;

-- Users can only see their own orders
CREATE POLICY "Users can view own giftcard orders"
  ON public.ktrenz_giftcard_orders FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Only service_role can insert/update (edge function)
CREATE POLICY "Service role can manage giftcard orders"
  ON public.ktrenz_giftcard_orders FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
