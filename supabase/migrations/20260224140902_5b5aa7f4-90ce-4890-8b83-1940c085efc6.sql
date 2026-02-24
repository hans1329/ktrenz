-- 수동 FES 계산 및 적용
-- Intensity: LEAST(21571/3, 80) + LEAST(1716/10, 80) + LEAST(200/2, 40) + 0 = 80+80+40+0 = 200
-- Velocity: total_score 변화가 미미하므로 약 0.15% → ~0.2
-- Energy = 200 (intensity가 지배적)
-- 직접 energy_score 업데이트
UPDATE v3_scores 
SET energy_score = 200, energy_change_24h = 0
WHERE wiki_entry_id = (SELECT id FROM wiki_entries WHERE title = 'BTS' LIMIT 1);

-- music_score 원복
UPDATE v3_scores 
SET music_score = 199
WHERE wiki_entry_id = (SELECT id FROM wiki_entries WHERE title = 'BTS' LIMIT 1);