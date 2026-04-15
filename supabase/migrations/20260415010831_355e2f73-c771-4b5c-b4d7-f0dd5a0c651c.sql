
-- Add language column to ktrenz_b2_insights for per-language caching
ALTER TABLE public.ktrenz_b2_insights ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'ko';

-- Drop old unique constraint and add new one including language
ALTER TABLE public.ktrenz_b2_insights DROP CONSTRAINT IF EXISTS ktrenz_b2_insights_run_id_star_id_key;
ALTER TABLE public.ktrenz_b2_insights ADD CONSTRAINT ktrenz_b2_insights_run_id_star_id_lang_key UNIQUE (run_id, star_id, language);
