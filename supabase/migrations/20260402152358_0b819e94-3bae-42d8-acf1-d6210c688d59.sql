-- Allow zero amount/shares for reward-based predictions
ALTER TABLE public.ktrenz_trend_bets ALTER COLUMN amount SET DEFAULT 0;
ALTER TABLE public.ktrenz_trend_bets ALTER COLUMN shares SET DEFAULT 0;

-- Drop unique constraint on trigger_id so daily markets can repeat
-- First find and drop the constraint
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT tc.constraint_name INTO constraint_name
  FROM information_schema.table_constraints tc
  WHERE tc.table_name = 'ktrenz_trend_markets'
    AND tc.constraint_type = 'UNIQUE'
    AND EXISTS (
      SELECT 1 FROM information_schema.constraint_column_usage ccu
      WHERE ccu.constraint_name = tc.constraint_name
        AND ccu.column_name = 'trigger_id'
    );
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.ktrenz_trend_markets DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;