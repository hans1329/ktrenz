-- 구 공식 시대의 에너지 스냅샷 삭제 (새 공식 적용 전 데이터)
-- 새 공식은 youtube_score가 최대 ~5000 수준이므로, 10000 이상은 구 공식 데이터
DELETE FROM v3_energy_snapshots_v2 
WHERE youtube_score > 10000;

-- 구 공식 베이스라인도 리셋
UPDATE v3_energy_baselines_v2 
SET avg_energy_7d = NULL, avg_energy_30d = NULL, updated_at = now()
WHERE wiki_entry_id IN (
  SELECT DISTINCT wiki_entry_id FROM v3_scores_v2 WHERE youtube_score IS NOT NULL
);