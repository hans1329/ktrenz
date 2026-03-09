
-- External YouTube channels watchlist for tracking artist appearances
CREATE TABLE public.ktrenz_watched_channels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id TEXT NOT NULL UNIQUE,
  channel_name TEXT NOT NULL,
  channel_url TEXT,
  category TEXT DEFAULT 'variety',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.ktrenz_watched_channels ENABLE ROW LEVEL SECURITY;

-- Admin read policy
CREATE POLICY "Admins can manage watched channels"
  ON public.ktrenz_watched_channels
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Service role (edge functions) can read
CREATE POLICY "Service role can read watched channels"
  ON public.ktrenz_watched_channels
  FOR SELECT
  TO anon
  USING (true);

-- Matched videos from external channels
CREATE TABLE public.ktrenz_external_video_matches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id TEXT NOT NULL,
  video_id TEXT NOT NULL,
  video_title TEXT NOT NULL,
  view_count BIGINT DEFAULT 0,
  published_at TIMESTAMP WITH TIME ZONE,
  wiki_entry_id UUID NOT NULL REFERENCES public.wiki_entries(id) ON DELETE CASCADE,
  matched_name TEXT,
  collected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(video_id, wiki_entry_id)
);

-- Enable RLS
ALTER TABLE public.ktrenz_external_video_matches ENABLE ROW LEVEL SECURITY;

-- Admin can read matches
CREATE POLICY "Admins can read external video matches"
  ON public.ktrenz_external_video_matches
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Edge functions can manage
CREATE POLICY "Anon can read external video matches"
  ON public.ktrenz_external_video_matches
  FOR SELECT
  TO anon
  USING (true);
