-- Add source_snippet column to store article excerpt (300-500 chars)
ALTER TABLE ktrenz_trend_triggers 
ADD COLUMN IF NOT EXISTS source_snippet text;