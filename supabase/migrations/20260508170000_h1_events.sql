-- Discover (h1) event telemetry — P8 of the Discover roadmap.
--
-- Captures the funnel events we'll need for retention/conversion tuning:
-- page_view, vouch, share_created, share_viewed, login_nudge_shown,
-- login_nudge_clicked, etc. Anon and authed users both insert; reads are
-- service-role only (analytics goes through edge functions / dashboards,
-- never client-side).

CREATE TABLE public.ktrenz_h1_events (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id  TEXT,                                               -- client-generated for anon attribution
  event_type  TEXT NOT NULL,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_h1_events_user_time   ON public.ktrenz_h1_events (user_id, occurred_at DESC);
CREATE INDEX idx_h1_events_type_time   ON public.ktrenz_h1_events (event_type, occurred_at DESC);
CREATE INDEX idx_h1_events_session     ON public.ktrenz_h1_events (session_id, occurred_at DESC) WHERE session_id IS NOT NULL;

ALTER TABLE public.ktrenz_h1_events ENABLE ROW LEVEL SECURITY;

-- Insert-only from clients. Read is service-role only — no SELECT policy.
CREATE POLICY "h1 events: insert (anyone, auth-bound or anon)"
  ON public.ktrenz_h1_events
  FOR INSERT
  WITH CHECK (
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR (auth.uid() IS NULL AND user_id IS NULL)
  );

-- ─── RPC: log a single event ─────────────────────────────────────────
-- Auth-aware wrapper so the client doesn't have to repeat the user_id /
-- anon-vs-authed branching every time.
CREATE OR REPLACE FUNCTION public.ktrenz_h1_log_event(
  _event_type TEXT,
  _session_id TEXT DEFAULT NULL,
  _metadata JSONB DEFAULT '{}'::jsonb
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _event_type IS NULL OR LENGTH(TRIM(_event_type)) = 0 THEN
    RAISE EXCEPTION 'event_type required' USING ERRCODE = '22023';
  END IF;
  IF LENGTH(_event_type) > 64 THEN
    RAISE EXCEPTION 'event_type too long' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.ktrenz_h1_events (user_id, session_id, event_type, metadata)
  VALUES (
    auth.uid(),
    NULLIF(TRIM(_session_id), ''),
    _event_type,
    COALESCE(_metadata, '{}'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ktrenz_h1_log_event(TEXT, TEXT, JSONB) TO anon, authenticated;
