
-- 1. ktrenz_trend_triggers에 purchase_stage, trend_grade 컬럼 추가
ALTER TABLE public.ktrenz_trend_triggers 
  ADD COLUMN IF NOT EXISTS purchase_stage text,
  ADD COLUMN IF NOT EXISTS trend_grade text;

-- 2. 아티스트별 트렌드 등급 집계 테이블
CREATE TABLE IF NOT EXISTS public.ktrenz_trend_artist_grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  star_id uuid REFERENCES public.ktrenz_stars(id) ON DELETE CASCADE NOT NULL,
  grade text NOT NULL DEFAULT 'spark',
  grade_score numeric NOT NULL DEFAULT 0,
  keyword_count integer NOT NULL DEFAULT 0,
  grade_breakdown jsonb DEFAULT '{}',
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(star_id)
);

-- 3. 인덱스
CREATE INDEX IF NOT EXISTS idx_trend_triggers_trend_grade ON public.ktrenz_trend_triggers(trend_grade) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_trend_triggers_purchase_stage ON public.ktrenz_trend_triggers(purchase_stage) WHERE purchase_stage IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trend_artist_grades_grade ON public.ktrenz_trend_artist_grades(grade);
CREATE INDEX IF NOT EXISTS idx_trend_artist_grades_grade_score ON public.ktrenz_trend_artist_grades(grade_score DESC);

-- 4. RLS
ALTER TABLE public.ktrenz_trend_artist_grades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read trend artist grades"
  ON public.ktrenz_trend_artist_grades FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Service role can manage trend artist grades"
  ON public.ktrenz_trend_artist_grades FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
