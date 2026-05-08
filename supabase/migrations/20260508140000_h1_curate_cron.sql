-- Schedule the daily curation of Discover (h1) Today's Drop.
-- Runs at 00:15 UTC each day — early enough that the fresh date is settled,
-- late enough for the b2 collectors that run at 00:00 UTC to land their
-- nightly batches first.
--
-- Idempotency: cron.schedule with the same name updates the existing job
-- (Supabase pg_cron uses cron.schedule(name, schedule, sql) UPSERT semantics
-- when a job of the same name already exists).
SELECT cron.schedule(
  'ktrenz-h1-curate-drop-daily',
  '15 0 * * *',
  $$
  SELECT net.http_post(
    url := 'https://jguylowswwgjvotdcsfj.supabase.co/functions/v1/ktrenz-h1-curate-drop',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpndXlsb3dzd3dnanZvdGRjc2ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4OTY5MzQsImV4cCI6MjA3NzQ3MjkzNH0.WYZndHJtDXwFITy9FYKv7bhqDcmhqNwZNrj_gEobJiM"}'::jsonb,
    body := '{"regions": ["global"]}'::jsonb
  ) AS request_id;
  $$
);
