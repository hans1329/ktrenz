-- Add per-language description columns to ktrenz_b2_items, mirroring
-- title_en/title_ja/title_zh/title_ko. Populated on-demand by
-- ktrenz-translate-field; missing values fall back to the source `description`.

ALTER TABLE ktrenz_b2_items
  ADD COLUMN IF NOT EXISTS description_en text,
  ADD COLUMN IF NOT EXISTS description_ja text,
  ADD COLUMN IF NOT EXISTS description_zh text,
  ADD COLUMN IF NOT EXISTS description_ko text;
