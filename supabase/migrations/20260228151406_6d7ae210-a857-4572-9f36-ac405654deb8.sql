-- ktrenz_engine_runs 테이블에 인증된 사용자 읽기 정책 추가
CREATE POLICY "Authenticated users can read engine runs"
ON public.ktrenz_engine_runs
FOR SELECT
USING (auth.role() = 'authenticated');
