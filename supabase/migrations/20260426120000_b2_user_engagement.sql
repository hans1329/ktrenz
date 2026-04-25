-- Battle 참여 자격 게이미피케이션:
--   사용자가 트렌드 인사이트를 1회 이상 보고
--   콘텐츠 카드를 2개 이상 본 후에야 그 트렌드(run)에 픽 가능.
-- (user_id, run_id)별로 트렌드 조회 시각과 본 콘텐츠 ID 배열을 저장.

CREATE TABLE IF NOT EXISTS public.ktrenz_b2_user_run_engagement (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES public.ktrenz_b2_runs(id) ON DELETE CASCADE,
  trend_viewed_at TIMESTAMPTZ,
  viewed_item_ids UUID[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, run_id)
);

CREATE INDEX IF NOT EXISTS idx_b2_engagement_user
  ON public.ktrenz_b2_user_run_engagement (user_id, updated_at DESC);

ALTER TABLE public.ktrenz_b2_user_run_engagement ENABLE ROW LEVEL SECURITY;

-- 사용자는 본인 행만 조회.
DROP POLICY IF EXISTS "engagement_select_own" ON public.ktrenz_b2_user_run_engagement;
CREATE POLICY "engagement_select_own"
  ON public.ktrenz_b2_user_run_engagement
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- INSERT/UPDATE는 RPC를 통해서만 허용 (정책 미부여 → 직접 쓰기 차단).

-- ── RPC: 트렌드 인사이트 1회 조회 기록 (idempotent) ──
CREATE OR REPLACE FUNCTION public.ktrenz_record_trend_view(p_run_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.ktrenz_b2_user_run_engagement (user_id, run_id, trend_viewed_at)
  VALUES (auth.uid(), p_run_id, NOW())
  ON CONFLICT (user_id, run_id) DO UPDATE
    SET trend_viewed_at = COALESCE(public.ktrenz_b2_user_run_engagement.trend_viewed_at, EXCLUDED.trend_viewed_at),
        updated_at = NOW();
END;
$$;

-- ── RPC: 콘텐츠 카드 1건 조회 기록 (item_id 중복 자동 제거) ──
CREATE OR REPLACE FUNCTION public.ktrenz_record_content_view(p_run_id UUID, p_item_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.ktrenz_b2_user_run_engagement (user_id, run_id, viewed_item_ids)
  VALUES (auth.uid(), p_run_id, ARRAY[p_item_id])
  ON CONFLICT (user_id, run_id) DO UPDATE
    SET viewed_item_ids = CASE
        WHEN p_item_id = ANY(public.ktrenz_b2_user_run_engagement.viewed_item_ids)
          THEN public.ktrenz_b2_user_run_engagement.viewed_item_ids
        ELSE array_append(public.ktrenz_b2_user_run_engagement.viewed_item_ids, p_item_id)
      END,
      updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.ktrenz_record_trend_view(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ktrenz_record_content_view(UUID, UUID) TO authenticated;
