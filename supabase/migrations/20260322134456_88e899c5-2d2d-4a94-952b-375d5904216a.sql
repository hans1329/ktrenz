-- 기존 하루 1회 start 크론잡 제거 후 6시간마다 실행으로 변경
SELECT cron.unschedule(337);

-- 6시간마다 실행: 03:30, 09:30, 15:30, 21:30 UTC = 12:30, 18:30, 00:30, 06:30 KST
SELECT cron.schedule(
  'trend-cron-start-6h',
  '30 3,9,15,21 * * *',
  $$
  SELECT net.http_post(
    url := 'https://jguylowswwgjvotdcsfj.supabase.co/functions/v1/ktrenz-trend-cron',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpndXlsb3dzd3dnanZvdGRjc2ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4OTY5MzQsImV4cCI6MjA3NzQ3MjkzNH0.WYZndHJtDXwFITy9FYKv7bhqDcmhqNwZNrj_gEobJiM"}'::jsonb,
    body := '{"action": "start", "phase": "detect", "batchSize": 5}'::jsonb
  ) AS request_id;
  $$
);