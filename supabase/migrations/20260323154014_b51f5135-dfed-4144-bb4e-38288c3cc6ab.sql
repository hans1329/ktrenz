
-- Clean up duplicate memberships: keep only the latest per user
DELETE FROM ktrenz_b2b_members
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id) id
  FROM ktrenz_b2b_members
  ORDER BY user_id, created_at DESC
);

-- Add unique constraint to prevent future duplicates
ALTER TABLE ktrenz_b2b_members
ADD CONSTRAINT ktrenz_b2b_members_user_id_unique UNIQUE (user_id);
