
-- Step 1: Drop existing bets (depends on markets)
TRUNCATE ktrenz_trend_bets, ktrenz_trend_markets;

-- Step 2: Alter markets table - replace binary pools with 4-outcome pools
ALTER TABLE ktrenz_trend_markets
  DROP COLUMN IF EXISTS pool_yes,
  DROP COLUMN IF EXISTS pool_no,
  DROP COLUMN IF EXISTS settlement_threshold,
  ADD COLUMN pool_decline numeric NOT NULL DEFAULT 100,
  ADD COLUMN pool_mild numeric NOT NULL DEFAULT 100,
  ADD COLUMN pool_strong numeric NOT NULL DEFAULT 100,
  ADD COLUMN pool_explosive numeric NOT NULL DEFAULT 100,
  ADD COLUMN initial_influence numeric;

-- outcome column: change from yes/no to range label
-- (outcome already exists as text, just keep it - values will now be: decline/mild/strong/explosive)

-- Step 3: Alter bets table - replace binary side with outcome label
ALTER TABLE ktrenz_trend_bets
  DROP COLUMN IF EXISTS side,
  ADD COLUMN outcome text NOT NULL DEFAULT 'mild';

-- Add check constraint for valid outcomes
ALTER TABLE ktrenz_trend_bets
  ADD CONSTRAINT chk_bet_outcome CHECK (outcome IN ('decline', 'mild', 'strong', 'explosive'));
