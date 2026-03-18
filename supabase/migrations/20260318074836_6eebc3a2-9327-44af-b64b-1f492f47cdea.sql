
-- T2 인과관계 분석을 위한 컬럼 추가
-- baseline_score: 아티스트 언급 전 검색 관심도 (첫 추적 시 기록)
-- peak_score: 추적 기간 중 최고 관심도
-- peak_at: peak_score 기록 시점
-- influence_index: (peak - baseline) / max(baseline, 1) * 100 (아티스트 영향력 지수)

ALTER TABLE ktrenz_trend_triggers
ADD COLUMN IF NOT EXISTS baseline_score integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS peak_score integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS peak_at timestamptz,
ADD COLUMN IF NOT EXISTS influence_index numeric(8,2) DEFAULT 0;

-- 인덱스: influence_index로 정렬 조회용
CREATE INDEX IF NOT EXISTS idx_trend_triggers_influence
ON ktrenz_trend_triggers (influence_index DESC)
WHERE status = 'active';
