
-- FPMM Prediction Market for Trend Keywords
-- Each trend trigger can have one market where users bet YES/NO with K-Points

CREATE TABLE public.ktrenz_trend_markets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trigger_id UUID NOT NULL REFERENCES public.ktrenz_trend_triggers(id) ON DELETE CASCADE,
  pool_yes NUMERIC NOT NULL DEFAULT 100,
  pool_no NUMERIC NOT NULL DEFAULT 100,
  total_volume NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'settled', 'cancelled')),
  outcome TEXT CHECK (outcome IN ('yes', 'no')),
  settlement_threshold NUMERIC NOT NULL DEFAULT 50,
  settled_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (trigger_id)
);

CREATE TABLE public.ktrenz_trend_bets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  market_id UUID NOT NULL REFERENCES public.ktrenz_trend_markets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('yes', 'no')),
  amount NUMERIC NOT NULL CHECK (amount >= 10),
  shares NUMERIC NOT NULL,
  payout NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_trend_markets_trigger ON public.ktrenz_trend_markets(trigger_id);
CREATE INDEX idx_trend_markets_status ON public.ktrenz_trend_markets(status);
CREATE INDEX idx_trend_bets_market ON public.ktrenz_trend_bets(market_id);
CREATE INDEX idx_trend_bets_user ON public.ktrenz_trend_bets(user_id);

-- RLS
ALTER TABLE public.ktrenz_trend_markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ktrenz_trend_bets ENABLE ROW LEVEL SECURITY;

-- Markets: everyone can read, only service role creates/updates
CREATE POLICY "Anyone can view markets"
  ON public.ktrenz_trend_markets FOR SELECT
  USING (true);

-- Bets: users can see their own, service role inserts
CREATE POLICY "Users can view their own bets"
  ON public.ktrenz_trend_bets FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Anyone can view bet counts"
  ON public.ktrenz_trend_bets FOR SELECT
  USING (true);

-- Updated_at trigger
CREATE TRIGGER update_trend_markets_updated_at
  BEFORE UPDATE ON public.ktrenz_trend_markets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
