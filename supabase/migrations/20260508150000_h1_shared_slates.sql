-- Public share artifacts for Discover (h1) — P6 of the Discover roadmap.
--
-- Users (logged-in or anon) can publish a snapshot of today's vouches as a
-- shareable slate. The slate URL can be opened by anyone without auth — it's
-- the viral loop entry point. Each row is content-only; no PII beyond an
-- optional handle. Data is denormalized (vouches stored as jsonb) so the
-- slate stays viewable even if the underlying drop or items change later.

CREATE TABLE public.ktrenz_h1_shared_slates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  handle      TEXT,                                                  -- optional public handle
  drop_date   DATE NOT NULL DEFAULT current_date,
  vouches     JSONB NOT NULL DEFAULT '[]'::jsonb,                    -- snapshot of cards + confidence
  view_count  INT  NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_h1_slates_user_date ON public.ktrenz_h1_shared_slates (user_id, drop_date DESC);
CREATE INDEX idx_h1_slates_created   ON public.ktrenz_h1_shared_slates (created_at DESC);

ALTER TABLE public.ktrenz_h1_shared_slates ENABLE ROW LEVEL SECURITY;

-- Slates are public artifacts — anyone can view (the URL itself is the share).
CREATE POLICY "h1 slates: public read"
  ON public.ktrenz_h1_shared_slates
  FOR SELECT
  USING (true);

-- Anyone (anon or authed) may publish. Auth-bound rows MUST set user_id to
-- their own uid; anon may insert with user_id = NULL only.
CREATE POLICY "h1 slates: insert (auth-bound or fully anon)"
  ON public.ktrenz_h1_shared_slates
  FOR INSERT
  WITH CHECK (
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR (auth.uid() IS NULL AND user_id IS NULL)
  );

-- ─── RPC: create a shared slate ──────────────────────────────────────
-- Accepts the user's vouches snapshot (array of {item_id, confidence,
-- title, artist, thumbnail, source}) and an optional handle. Returns the
-- new slate id so the client can build the share URL.
CREATE OR REPLACE FUNCTION public.ktrenz_h1_create_shared_slate(
  _vouches JSONB,
  _handle TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID := auth.uid();
  _id UUID;
BEGIN
  IF _vouches IS NULL OR jsonb_typeof(_vouches) <> 'array' THEN
    RAISE EXCEPTION 'vouches must be a json array' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(_vouches) = 0 THEN
    RAISE EXCEPTION 'vouches array is empty' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(_vouches) > 50 THEN
    RAISE EXCEPTION 'too many vouches in slate' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.ktrenz_h1_shared_slates (user_id, handle, vouches)
  VALUES (
    _user_id,
    NULLIF(TRIM(_handle), ''),
    _vouches
  )
  RETURNING id INTO _id;

  RETURN jsonb_build_object(
    'slate_id', _id,
    'created_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ktrenz_h1_create_shared_slate(JSONB, TEXT) TO anon, authenticated;

-- ─── RPC: bump view count when slate is rendered ─────────────────────
-- Cheap counter for share-back analytics. Idempotency not enforced — refresh
-- bumps. Acceptable for v1; switch to per-IP or per-session if it skews.
CREATE OR REPLACE FUNCTION public.ktrenz_h1_bump_slate_view(_slate_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.ktrenz_h1_shared_slates
  SET view_count = view_count + 1
  WHERE id = _slate_id;
$$;

GRANT EXECUTE ON FUNCTION public.ktrenz_h1_bump_slate_view(UUID) TO anon, authenticated;
