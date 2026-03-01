
-- Function to manage the ktrenz daily collection cron schedule
CREATE OR REPLACE FUNCTION public.manage_ktrenz_schedule(
  p_action text,
  p_hour integer DEFAULT 20,
  p_minute integer DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_job_name text := 'ktrenz-daily-collection';
  v_schedule text;
  v_existing bigint;
  v_result jsonb;
  v_command text;
BEGIN
  IF p_action = 'clear' THEN
    SELECT jobid INTO v_existing FROM cron.job WHERE jobname = v_job_name;
    IF v_existing IS NOT NULL THEN
      PERFORM cron.unschedule(v_job_name);
    END IF;
    RETURN jsonb_build_object('status', 'cleared', 'jobname', v_job_name);
  
  ELSIF p_action = 'set' THEN
    IF p_hour < 0 OR p_hour > 23 THEN RAISE EXCEPTION 'Hour must be 0-23'; END IF;
    IF p_minute < 0 OR p_minute > 59 THEN RAISE EXCEPTION 'Minute must be 0-59'; END IF;

    v_schedule := p_minute || ' ' || p_hour || ' * * *';
    
    SELECT jobid INTO v_existing FROM cron.job WHERE jobname = v_job_name;
    IF v_existing IS NOT NULL THEN
      PERFORM cron.unschedule(v_job_name);
    END IF;

    v_command := 'SELECT net.http_post(url:=''https://jguylowswwgjvotdcsfj.supabase.co/functions/v1/data-engine'',headers:=''{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpndXlsb3dzd3dnanZvdGRjc2ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4OTY5MzQsImV4cCI6MjA3NzQ3MjkzNH0.WYZndHJtDXwFITy9FYKv7bhqDcmhqNwZNrj_gEobJiM"}''::jsonb,body:=''{"module":"all","triggerSource":"cron","isBaseline":true}''::jsonb) AS request_id;';

    PERFORM cron.schedule(v_job_name, v_schedule, v_command);

    RETURN jsonb_build_object(
      'status', 'scheduled',
      'jobname', v_job_name,
      'schedule', v_schedule,
      'utc_hour', p_hour,
      'utc_minute', p_minute,
      'kst_hour', (p_hour + 9) % 24,
      'kst_minute', p_minute
    );

  ELSIF p_action = 'status' THEN
    SELECT jsonb_build_object(
      'jobid', jobid,
      'jobname', jobname,
      'schedule', schedule,
      'active', active
    ) INTO v_result
    FROM cron.job WHERE jobname = v_job_name;
    
    IF v_result IS NULL THEN
      RETURN jsonb_build_object('status', 'not_scheduled');
    END IF;
    RETURN v_result || jsonb_build_object('status', 'active');

  ELSE
    RAISE EXCEPTION 'Unknown action: %. Use set, clear, or status', p_action;
  END IF;
END;
$fn$;

-- Simple status getter
CREATE OR REPLACE FUNCTION public.get_ktrenz_schedule()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'jobid', jobid,
    'jobname', jobname,
    'schedule', schedule,
    'active', active
  ) INTO v_result
  FROM cron.job WHERE jobname = 'ktrenz-daily-collection';
  
  IF v_result IS NULL THEN
    RETURN jsonb_build_object('status', 'not_scheduled');
  END IF;
  RETURN v_result || jsonb_build_object('status', 'active');
END;
$fn$;
