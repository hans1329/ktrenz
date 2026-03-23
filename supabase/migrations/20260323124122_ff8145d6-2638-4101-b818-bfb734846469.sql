
CREATE TABLE public.ktrenz_user_locales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  browser_language text NOT NULL DEFAULT 'en',
  browser_timezone text,
  country_code text,
  detected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.ktrenz_user_locales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own locale" ON public.ktrenz_user_locales
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert own locale" ON public.ktrenz_user_locales
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own locale" ON public.ktrenz_user_locales
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admin read all locales" ON public.ktrenz_user_locales
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE INDEX idx_ktrenz_user_locales_country ON public.ktrenz_user_locales(country_code);
CREATE INDEX idx_ktrenz_user_locales_lang ON public.ktrenz_user_locales(browser_language);

COMMENT ON TABLE public.ktrenz_user_locales IS 'Browser-detected locale info for user geo analytics';
