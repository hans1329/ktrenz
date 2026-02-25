
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Remove old cron job if exists
SELECT cron.unschedule('calculate-energy-batch0')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'calculate-energy-batch0');

SELECT cron.unschedule('calculate-energy-batch1')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'calculate-energy-batch1');

SELECT cron.unschedule('calculate-energy-batch2')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'calculate-energy-batch2');

SELECT cron.unschedule('calculate-energy-batch3')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'calculate-energy-batch3');

SELECT cron.unschedule('calculate-energy-score')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'calculate-energy-score');

-- Batch 0: offset=0, size=15 — 매일 13:00 KST (04:00 UTC)
SELECT cron.schedule(
  'calculate-energy-batch0',
  '0 4 * * *',
  $$
  SELECT net.http_post(
    url:='https://jguylowswwgjvotdcsfj.supabase.co/functions/v1/calculate-energy-score',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpndXlsb3dzd3dnanZvdGRjc2ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4OTY5MzQsImV4cCI6MjA3NzQ3MjkzNH0.WYZndHJtDXwFITy9FYKv7bhqDcmhqNwZNrj_gEobJiM"}'::jsonb,
    body:='{"batchSize": 15, "batchOffset": 0}'::jsonb
  ) AS request_id;
  $$
);

-- Batch 1: offset=15, size=15 — 5분 후 (04:05 UTC)
SELECT cron.schedule(
  'calculate-energy-batch1',
  '5 4 * * *',
  $$
  SELECT net.http_post(
    url:='https://jguylowswwgjvotdcsfj.supabase.co/functions/v1/calculate-energy-score',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpndXlsb3dzd3dnanZvdGRjc2ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4OTY5MzQsImV4cCI6MjA3NzQ3MjkzNH0.WYZndHJtDXwFITy9FYKv7bhqDcmhqNwZNrj_gEobJiM"}'::jsonb,
    body:='{"batchSize": 15, "batchOffset": 15}'::jsonb
  ) AS request_id;
  $$
);

-- Batch 2: offset=30, size=15 — 10분 후 (04:10 UTC)
SELECT cron.schedule(
  'calculate-energy-batch2',
  '10 4 * * *',
  $$
  SELECT net.http_post(
    url:='https://jguylowswwgjvotdcsfj.supabase.co/functions/v1/calculate-energy-score',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpndXlsb3dzd3dnanZvdGRjc2ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4OTY5MzQsImV4cCI6MjA3NzQ3MjkzNH0.WYZndHJtDXwFITy9FYKv7bhqDcmhqNwZNrj_gEobJiM"}'::jsonb,
    body:='{"batchSize": 15, "batchOffset": 30}'::jsonb
  ) AS request_id;
  $$
);

-- Batch 3: offset=45, size=15 — 15분 후 (04:15 UTC)
SELECT cron.schedule(
  'calculate-energy-batch3',
  '15 4 * * *',
  $$
  SELECT net.http_post(
    url:='https://jguylowswwgjvotdcsfj.supabase.co/functions/v1/calculate-energy-score',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpndXlsb3dzd3dnanZvdGRjc2ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4OTY5MzQsImV4cCI6MjA3NzQ3MjkzNH0.WYZndHJtDXwFITy9FYKv7bhqDcmhqNwZNrj_gEobJiM"}'::jsonb,
    body:='{"batchSize": 15, "batchOffset": 45}'::jsonb
  ) AS request_id;
  $$
);
