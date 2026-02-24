-- v2 테이블: INSERT/UPDATE/DELETE는 service_role만 허용 (기본 RLS로 차단)
-- 기존 overly permissive 정책 제거

-- v3_scores_v2
DROP POLICY IF EXISTS "v3_scores_v2_insert" ON public.v3_scores_v2;
DROP POLICY IF EXISTS "v3_scores_v2_update" ON public.v3_scores_v2;

-- v3_energy_snapshots_v2
DROP POLICY IF EXISTS "v3_energy_snapshots_v2_insert" ON public.v3_energy_snapshots_v2;

-- v3_energy_baselines_v2
DROP POLICY IF EXISTS "v3_energy_baselines_v2_insert" ON public.v3_energy_baselines_v2;
DROP POLICY IF EXISTS "v3_energy_baselines_v2_update" ON public.v3_energy_baselines_v2;