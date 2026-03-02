DO $$
DECLARE
  v_job RECORD;
BEGIN
  FOR v_job IN
    SELECT jobname
    FROM cron.job
    WHERE jobname IN (
      'ktrenz-daily-collection',
      'ktrenz-daily-youtube',
      'ktrenz-daily-music',
      'ktrenz-daily-hanteo',
      'ktrenz-daily-buzz',
      'ktrenz-daily-energy'
    )
  LOOP
    PERFORM cron.unschedule(v_job.jobname);
  END LOOP;
END $$;

SELECT cron.schedule(
  'ktrenz-daily-youtube',
  '5 8 * * *',
  $$
  SELECT net.http_post(
    url:='https://jguylowswwgjvotdcsfj.supabase.co/functions/v1/data-engine',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpndXlsb3dzd3dnanZvdGRjc2ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4OTY5MzQsImV4cCI6MjA3NzQ3MjkzNH0.WYZndHJtDXwFITy9FYKv7bhqDcmhqNwZNrj_gEobJiM"}'::jsonb,
    body:='{"module":"youtube","triggerSource":"cron_split"}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'ktrenz-daily-music',
  '20 8 * * *',
  $$
  SELECT net.http_post(
    url:='https://jguylowswwgjvotdcsfj.supabase.co/functions/v1/data-engine',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpndXlsb3dzd3dnanZvdGRjc2ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4OTY5MzQsImV4cCI6MjA3NzQ3MjkzNH0.WYZndHJtDXwFITy9FYKv7bhqDcmhqNwZNrj_gEobJiM"}'::jsonb,
    body:='{"module":"music","triggerSource":"cron_split"}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'ktrenz-daily-hanteo',
  '35 8 * * *',
  $$
  SELECT net.http_post(
    url:='https://jguylowswwgjvotdcsfj.supabase.co/functions/v1/data-engine',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpndXlsb3dzd3dnanZvdGRjc2ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4OTY5MzQsImV4cCI6MjA3NzQ3MjkzNH0.WYZndHJtDXwFITy9FYKv7bhqDcmhqNwZNrj_gEobJiM"}'::jsonb,
    body:='{"module":"hanteo","triggerSource":"cron_split"}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'ktrenz-daily-buzz',
  '50 8 * * *',
  $$
  SELECT net.http_post(
    url:='https://jguylowswwgjvotdcsfj.supabase.co/functions/v1/data-engine',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpndXlsb3dzd3dnanZvdGRjc2ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4OTY5MzQsImV4cCI6MjA3NzQ3MjkzNH0.WYZndHJtDXwFITy9FYKv7bhqDcmhqNwZNrj_gEobJiM"}'::jsonb,
    body:='{"module":"buzz","triggerSource":"cron_split"}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'ktrenz-daily-energy',
  '20 9 * * *',
  $$
  SELECT net.http_post(
    url:='https://jguylowswwgjvotdcsfj.supabase.co/functions/v1/data-engine',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpndXlsb3dzd3dnanZvdGRjc2ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4OTY5MzQsImV4cCI6MjA3NzQ3MjkzNH0.WYZndHJtDXwFITy9FYKv7bhqDcmhqNwZNrj_gEobJiM"}'::jsonb,
    body:='{"module":"energy","triggerSource":"cron_split","isBaseline":false}'::jsonb
  ) AS request_id;
  $$
);