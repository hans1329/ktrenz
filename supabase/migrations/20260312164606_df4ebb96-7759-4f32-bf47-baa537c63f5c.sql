-- Reset all suppressed flags (no longer used)
UPDATE public.ktrenz_data_quality_issues
SET suppressed = false, suppressed_at = null, suppressed_note = null
WHERE suppressed = true;

-- Also delete resolved issues that were previously suppressed to start clean
DELETE FROM public.ktrenz_data_quality_issues
WHERE resolved = true;