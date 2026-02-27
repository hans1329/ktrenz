
-- Step 1: Delete duplicate rows, keeping the one with the highest total_score for each wiki_entry_id
DELETE FROM v3_scores_v2
WHERE id NOT IN (
  SELECT DISTINCT ON (wiki_entry_id) id
  FROM v3_scores_v2
  ORDER BY wiki_entry_id, total_score DESC NULLS LAST, scored_at DESC
);

-- Step 2: Add unique constraint to prevent future duplicates
ALTER TABLE v3_scores_v2 ADD CONSTRAINT v3_scores_v2_wiki_entry_id_unique UNIQUE (wiki_entry_id);
