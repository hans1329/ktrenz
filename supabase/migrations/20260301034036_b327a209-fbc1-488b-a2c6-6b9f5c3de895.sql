-- v3_energy_snapshots_v2에 is_baseline 플래그 추가
-- 크론/전체 수집 시에만 true로 설정되어, 이후 개별/수시 수집의 비교 기준점으로 사용됨
ALTER TABLE public.v3_energy_snapshots_v2
ADD COLUMN is_baseline boolean NOT NULL DEFAULT false;

-- 베이스라인 조회 성능을 위한 인덱스
CREATE INDEX idx_energy_snapshots_baseline
ON public.v3_energy_snapshots_v2 (wiki_entry_id, is_baseline, snapshot_at DESC)
WHERE is_baseline = true;