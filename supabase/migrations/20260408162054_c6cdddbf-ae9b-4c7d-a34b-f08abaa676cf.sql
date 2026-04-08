
-- 파이프라인이 브라우저 닫힘/크래시로 멈추지 않도록 서버 사이드 주기적 tick 추가
-- 2분마다 tick을 호출하여 stale lock 복구 및 다음 배치 자동 진행
SELECT cron.schedule(
  'ktrenz-pipeline-tick',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url:='https://jguylowswwgjvotdcsfj.supabase.co/functions/v1/ktrenz-trend-cron',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpndXlsb3dzd3dnanZvdGRjc2ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4OTY5MzQsImV4cCI6MjA3NzQ3MjkzNH0.WYZndHJtDXwFITy9FYKv7bhqDcmhqNwZNrj_gEobJiM"}'::jsonb,
    body:='{"action":"tick"}'::jsonb
  ) AS request_id;
  $$
);
