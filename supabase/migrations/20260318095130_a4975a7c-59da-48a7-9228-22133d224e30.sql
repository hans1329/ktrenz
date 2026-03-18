ALTER TABLE ktrenz_trend_triggers
ADD COLUMN IF NOT EXISTS context_ko text,
ADD COLUMN IF NOT EXISTS context_ja text,
ADD COLUMN IF NOT EXISTS context_zh text;