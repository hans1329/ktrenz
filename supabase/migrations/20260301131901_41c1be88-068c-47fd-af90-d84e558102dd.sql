-- 최신 수집 전의 모든 구 스냅샷 삭제 (새 공식 기반 데이터만 유지)
-- 오늘 13:06 이후 스냅샷만 남김
DELETE FROM v3_energy_snapshots_v2 
WHERE snapshot_at < '2026-03-01T13:06:00+00:00';

-- 베이스라인 전면 리셋
UPDATE v3_energy_baselines_v2 
SET avg_energy_7d = NULL, avg_energy_30d = NULL, updated_at = now();

-- v3_scores_v2의 변동률도 null로 리셋 (새 스냅샷 축적 전까지)
UPDATE v3_scores_v2 
SET energy_change_24h = NULL, 
    youtube_change_24h = NULL, 
    buzz_change_24h = NULL, 
    music_change_24h = NULL, 
    album_change_24h = NULL;