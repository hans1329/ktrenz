
-- Remove legacy cron jobs
SELECT cron.unschedule('settle-trend-vs-daily');
SELECT cron.unschedule('match-trend-vs-daily');

-- Register daily pipeline cron at 21:00 UTC (06:00 KST)
SELECT cron.schedule(
  'ktrenz-pipeline-daily',
  '0 21 * * *',
  $$
  SELECT net.http_post(
    url:='https://jguylowswwgjvotdcsfj.supabase.co/functions/v1/ktrenz-trend-cron',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpndXlsb3dzd3dnanZvdGRjc2ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4OTY5MzQsImV4cCI6MjA3NzQ3MjkzNH0.WYZndHJtDXwFITy9FYKv7bhqDcmhqNwZNrj_gEobJiM"}'::jsonb,
    body:='{"phase":"detect","batchSize":15}'::jsonb
  ) AS request_id;
  $$
);
