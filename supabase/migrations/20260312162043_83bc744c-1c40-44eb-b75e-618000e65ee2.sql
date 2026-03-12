ALTER TABLE public.ktrenz_data_quality_issues 
ADD COLUMN IF NOT EXISTS suppressed boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS suppressed_at timestamptz,
ADD COLUMN IF NOT EXISTS suppressed_note text;