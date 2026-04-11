-- Remove old static cron jobs
SELECT cron.unschedule('match-trend-vs-daily');
SELECT cron.unschedule('settle-trend-vs-daily');

-- Register new battle orchestrator (runs every 3 minutes)
SELECT cron.schedule(
  'battle-cron-orchestrator',
  '*/3 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://jguylowswwgjvotdcsfj.supabase.co/functions/v1/ktrenz-battle-cron',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpndXlsb3dzd3dnanZvdGRjc2ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4OTY5MzQsImV4cCI6MjA3NzQ3MjkzNH0.WYZndHJtDXwFITy9FYKv7bhqDcmhqNwZNrj_gEobJiM"}'::jsonb,
    body := '{"source": "cron"}'::jsonb
  ) AS request_id;
  $$
);