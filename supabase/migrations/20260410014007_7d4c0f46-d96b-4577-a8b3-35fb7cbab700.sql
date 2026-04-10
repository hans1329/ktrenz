
-- Add translation columns
ALTER TABLE public.ktrenz_b2_items
  ADD COLUMN IF NOT EXISTS title_en TEXT,
  ADD COLUMN IF NOT EXISTS title_ja TEXT,
  ADD COLUMN IF NOT EXISTS title_zh TEXT;

-- Create trigger function to auto-translate via edge function
CREATE OR REPLACE FUNCTION public.ktrenz_b2_items_translate_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  edge_url TEXT;
  anon_key TEXT;
  langs TEXT[] := ARRAY['en', 'ja', 'zh'];
  lang TEXT;
BEGIN
  edge_url := rtrim(current_setting('app.settings.supabase_url', true), '/') || '/functions/v1/ktrenz-translate-field';
  anon_key := current_setting('app.settings.supabase_anon_key', true);

  IF edge_url IS NULL OR anon_key IS NULL THEN
    RETURN NEW;
  END IF;

  FOREACH lang IN ARRAY langs LOOP
    PERFORM net.http_post(
      url := edge_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || anon_key
      ),
      body := jsonb_build_object(
        'table', 'ktrenz_b2_items',
        'field', 'title',
        'ids', jsonb_build_array(NEW.id),
        'language', lang
      )
    );
  END LOOP;

  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trg_ktrenz_b2_items_translate ON public.ktrenz_b2_items;
CREATE TRIGGER trg_ktrenz_b2_items_translate
  AFTER INSERT ON public.ktrenz_b2_items
  FOR EACH ROW
  WHEN (NEW.title IS NOT NULL)
  EXECUTE FUNCTION public.ktrenz_b2_items_translate_trigger();
