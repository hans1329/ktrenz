
-- 기존 ktrenz 관련 크론 삭제
SELECT cron.unschedule(8);   -- buzz-cron-6h
SELECT cron.unschedule(10);  -- daily-data-crawl (깨진 크론)
SELECT cron.unschedule(11);  -- ktrenz-data-collector-daily

-- 통합 크론: 매일 06:00 KST (21:00 UTC) + 18:00 KST (09:00 UTC)
SELECT cron.schedule(
  'ktrenz-collector-morning',
  '0 21 * * *',
  $$
  SELECT net.http_post(
    url:='https://jguylowswwgjvotdcsfj.supabase.co/functions/v1/ktrenz-data-collector',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpndXlsb3dzd3dnanZvdGRjc2ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4OTY5MzQsImV4cCI6MjA3NzQ3MjkzNH0.WYZndHJtDXwFITy9FYKv7bhqDcmhqNwZNrj_gEobJiM"}'::jsonb,
    body:='{"source": "all"}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'ktrenz-collector-evening',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url:='https://jguylowswwgjvotdcsfj.supabase.co/functions/v1/ktrenz-data-collector',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpndXlsb3dzd3dnanZvdGRjc2ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4OTY5MzQsImV4cCI6MjA3NzQ3MjkzNH0.WYZndHJtDXwFITy9FYKv7bhqDcmhqNwZNrj_gEobJiM"}'::jsonb,
    body:='{"source": "all"}'::jsonb
  ) AS request_id;
  $$
);
