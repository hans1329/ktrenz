-- v3_scores_v2에서 Tier 1이 아닌 아티스트의 오래된 레코드 삭제
DELETE FROM v3_scores_v2
WHERE wiki_entry_id NOT IN (
  SELECT wiki_entry_id FROM v3_artist_tiers WHERE tier = 1
);