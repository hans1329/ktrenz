
-- Create updated_at trigger function if not exists
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ktrenz_stars table
CREATE TABLE public.ktrenz_stars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wiki_entry_id UUID REFERENCES public.wiki_entries(id) ON DELETE CASCADE NOT NULL,
  star_type TEXT NOT NULL CHECK (star_type IN ('group', 'member', 'solo')),
  group_star_id UUID REFERENCES public.ktrenz_stars(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  name_ko TEXT,
  musicbrainz_id TEXT,
  influence_categories TEXT[] DEFAULT '{}',
  social_handles JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(wiki_entry_id)
);

CREATE INDEX idx_ktrenz_stars_group ON public.ktrenz_stars(group_star_id) WHERE group_star_id IS NOT NULL;
CREATE INDEX idx_ktrenz_stars_type ON public.ktrenz_stars(star_type);
CREATE INDEX idx_ktrenz_stars_mbid ON public.ktrenz_stars(musicbrainz_id) WHERE musicbrainz_id IS NOT NULL;

ALTER TABLE public.ktrenz_stars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read ktrenz_stars"
  ON public.ktrenz_stars FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE TRIGGER set_ktrenz_stars_updated_at
  BEFORE UPDATE ON public.ktrenz_stars
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
