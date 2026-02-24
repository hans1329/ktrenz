-- music_score를 1 변경하여 트리거 발동 후 즉시 복원
-- Step 1: 트리거 발동용 변경
UPDATE v3_scores 
SET music_score = music_score + 1
WHERE wiki_entry_id = (SELECT id FROM wiki_entries WHERE title = 'BTS' LIMIT 1);