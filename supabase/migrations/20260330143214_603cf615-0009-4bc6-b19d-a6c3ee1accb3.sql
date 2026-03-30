-- 기존 ktrenz 관련 크론잡 제거
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname ILIKE '%ktrenz%';

-- K2 파이프라인: 하루 1회 (한국시간 오전 6시 = UTC 21시)
SELECT cron.schedule(
  'ktrenz-pipeline-daily',
  '0 21 * * *',
  $$
  SELECT net.http_post(
    url:='https://jguylowswwgjvotdcsfj.supabase.co/functions/v1/ktrenz-trend-cron',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpndXlsb3dzd3dnanZvdGRjc2ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4OTY5MzQsImV4cCI6MjA3NzQ3MjkzNH0.WYZndHJtDXwFITy9FYKv7bhqDcmhqNwZNrj_gEobJiM"}'::jsonb,
    body:='{"action": "start", "phase": "collect_social", "batchSize": 20}'::jsonb
  ) as request_id;
  $$
);

-- 파이프라인 tick: 5분마다 (진행 중인 run 없으면 no-op)
SELECT cron.schedule(
  'ktrenz-pipeline-tick',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url:='https://jguylowswwgjvotdcsfj.supabase.co/functions/v1/ktrenz-trend-cron',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpndXlsb3dzd3dnanZvdGRjc2ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4OTY5MzQsImV4cCI6MjA3NzQ3MjkzNH0.WYZndHJtDXwFITy9FYKv7bhqDcmhqNwZNrj_gEobJiM"}'::jsonb,
    body:='{"action": "tick"}'::jsonb
  ) as request_id;
  $$
);