-- Schedule the daily resolution of expired Discover (h1) drops.
-- Runs at 01:00 UTC each day — well after the 00:15 curate cron, so any drop
-- whose resolution_at landed in the previous 24h gets settled in one pass.
SELECT cron.schedule(
  'ktrenz-h1-resolve-drop-daily',
  '0 1 * * *',
  $$
  SELECT net.http_post(
    url := 'https://jguylowswwgjvotdcsfj.supabase.co/functions/v1/ktrenz-h1-resolve-drop',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpndXlsb3dzd3dnanZvdGRjc2ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4OTY5MzQsImV4cCI6MjA3NzQ3MjkzNH0.WYZndHJtDXwFITy9FYKv7bhqDcmhqNwZNrj_gEobJiM"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- ─── RPC: user's vouch history (PRD §13) ─────────────────────────────
-- Returns the caller's vouches, joined with the underlying item + star info,
-- ordered most-recent first. Powers the History tab (P7).
CREATE OR REPLACE FUNCTION public.ktrenz_h1_my_history(_limit INT DEFAULT 50, _offset INT DEFAULT 0)
RETURNS TABLE (
  vouch_id          UUID,
  drop_id           UUID,
  drop_date         DATE,
  confidence        TEXT,
  vouched_at        TIMESTAMPTZ,
  resolved          BOOL,
  hit               BOOL,
  raw_score         NUMERIC,
  final_score       NUMERIC,
  k_cash            INT,
  item_id           UUID,
  source            TEXT,
  title             TEXT,
  thumbnail         TEXT,
  url               TEXT,
  star_display_name TEXT,
  star_image_url    TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    v.id            AS vouch_id,
    v.drop_id,
    d.drop_date,
    v.confidence,
    v.vouched_at,
    v.resolved,
    v.hit,
    v.raw_score,
    v.final_score,
    v.k_cash,
    i.id            AS item_id,
    i.source,
    i.title,
    i.thumbnail,
    i.url,
    s.display_name  AS star_display_name,
    s.image_url     AS star_image_url
  FROM public.ktrenz_h1_vouches v
  JOIN public.ktrenz_h1_daily_drop d ON d.id = v.drop_id
  JOIN public.ktrenz_b2_items i ON i.id = d.item_id
  LEFT JOIN public.ktrenz_stars s ON s.id = i.star_id
  WHERE v.user_id = auth.uid()
  ORDER BY v.vouched_at DESC
  LIMIT GREATEST(_limit, 0)
  OFFSET GREATEST(_offset, 0);
$$;

GRANT EXECUTE ON FUNCTION public.ktrenz_h1_my_history(INT, INT) TO authenticated;
