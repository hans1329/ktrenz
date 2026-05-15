-- Schedule daily YT stats refresh for items in active (unresolved) Discover
-- drops. Without this, engagement_score is frozen from the moment an item
-- is first scraped and growth-based viral judgment collapses (resolved drops
-- showed delta=0 across the board on 2026-05-15).
--
-- Schedule: 22:00 UTC = KST 07:00. Runs before the 00:15 UTC curate so the
-- daily mid-round rank shown to users reflects fresh views.

SELECT cron.unschedule('ktrenz-h1-refresh-stats-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ktrenz-h1-refresh-stats-daily');

SELECT cron.schedule(
  'ktrenz-h1-refresh-stats-daily',
  '0 22 * * *',
  $$
  SELECT net.http_post(
    url := 'https://jguylowswwgjvotdcsfj.supabase.co/functions/v1/ktrenz-h1-refresh-stats',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpndXlsb3dzd3dnanZvdGRjc2ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4OTY5MzQsImV4cCI6MjA3NzQ3MjkzNH0.WYZndHJtDXwFITy9FYKv7bhqDcmhqNwZNrj_gEobJiM"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
