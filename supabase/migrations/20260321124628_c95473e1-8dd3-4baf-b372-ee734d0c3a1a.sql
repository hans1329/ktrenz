
-- Add detection logging columns to ktrenz_stars
ALTER TABLE public.ktrenz_stars
ADD COLUMN IF NOT EXISTS last_detected_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_detect_result JSONB;

-- Index for quick lookup of recently detected stars
CREATE INDEX IF NOT EXISTS idx_ktrenz_stars_last_detected ON public.ktrenz_stars (last_detected_at DESC NULLS LAST) WHERE is_active = true;
