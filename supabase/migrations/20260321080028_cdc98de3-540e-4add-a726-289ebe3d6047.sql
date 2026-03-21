
-- Remove decline outcome, switch to 3-outcome model: mild, strong, explosive
-- Migrate existing 'decline' bets to 'mild'
UPDATE ktrenz_trend_bets SET outcome = 'mild' WHERE outcome = 'decline';

-- Drop old constraint and add new one
ALTER TABLE ktrenz_trend_bets DROP CONSTRAINT IF EXISTS chk_bet_outcome;
ALTER TABLE ktrenz_trend_bets ADD CONSTRAINT chk_bet_outcome CHECK (outcome IN ('mild', 'strong', 'explosive'));

-- Remove pool_decline column from markets
ALTER TABLE ktrenz_trend_markets DROP COLUMN IF EXISTS pool_decline;

-- Update existing markets: set any 'decline' outcomes to 'mild'
UPDATE ktrenz_trend_markets SET outcome = 'mild' WHERE outcome = 'decline';
