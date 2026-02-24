-- 모든 아티스트 FES 재계산 트리거 발동
UPDATE v3_scores SET buzz_score = buzz_score + 1;
UPDATE v3_scores SET buzz_score = buzz_score - 1;