
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.schedule(
  'daily-full-collection',
  '30 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://jguylowswwgjvotdcsfj.supabase.co/functions/v1/ktrenz-trend-cron',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpndXlsb3dzd3dnanZvdGRjc2ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4OTY5MzQsImV4cCI6MjA3NzQ3MjkzNH0.WYZndHJtDXwFITy9FYKv7bhqDcmhqNwZNrj_gEobJiM"}'::jsonb,
    body := '{"action": "start", "phase": "detect", "batchSize": 5}'::jsonb
  ) AS request_id;
  $$
);
