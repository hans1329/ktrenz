
-- Cleanup function to remove all legacy ktrenz cron jobs
CREATE OR REPLACE FUNCTION public.cleanup_legacy_ktrenz_crons()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_rec record;
  v_count integer := 0;
BEGIN
  FOR v_rec IN 
    SELECT jobid, jobname FROM cron.job 
    WHERE jobname LIKE 'ktrenz-%' 
       OR jobname LIKE 'calculate-energy%'
  LOOP
    PERFORM cron.unschedule(v_rec.jobid);
    v_count := v_count + 1;
  END LOOP;
  
  RETURN jsonb_build_object('deleted', v_count);
END;
$fn$;

-- Execute it immediately
SELECT public.cleanup_legacy_ktrenz_crons();

-- Now set the new unified schedule (KST 05:05 = UTC 20:05)
SELECT public.manage_ktrenz_schedule('set', 20, 5);

-- Drop the cleanup function
DROP FUNCTION public.cleanup_legacy_ktrenz_crons();
