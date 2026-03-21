-- Reset all active triggers that have capped baseline_score=100
UPDATE public.ktrenz_trend_triggers 
SET status = 'expired', expired_at = now() 
WHERE status = 'active';

-- Clean up tracking records from these capped runs
DELETE FROM public.ktrenz_trend_tracking 
WHERE tracked_at >= '2026-03-21T00:00:00Z';