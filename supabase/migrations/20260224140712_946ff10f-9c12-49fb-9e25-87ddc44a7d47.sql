-- buzz_score를 현재값 그대로 SET하여 트리거 재발동 (실제 값 변경 없음)
UPDATE v3_scores 
SET buzz_score = buzz_score
WHERE wiki_entry_id = (SELECT id FROM wiki_entries WHERE title = 'BTS' LIMIT 1);