
-- 한터차트 등 외부 수집 URL 설정 테이블
CREATE TABLE public.ktrenz_collection_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  hanteo_chart_url TEXT NOT NULL DEFAULT 'https://www.hanteochart.com/honors/initial',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.ktrenz_collection_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read config"
  ON public.ktrenz_collection_config FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can update config"
  ON public.ktrenz_collection_config FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- 기본 설정 삽입
INSERT INTO public.ktrenz_collection_config (id, hanteo_chart_url)
VALUES ('default', 'https://www.hanteochart.com/honors/initial');
