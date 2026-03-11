-- 에이전트 슬롯의 avatar_url을 wiki_entries의 현재 image_url로 동기화
UPDATE ktrenz_agent_slots s
SET avatar_url = w.image_url
FROM wiki_entries w
WHERE s.wiki_entry_id = w.id
  AND s.avatar_url IS NOT NULL
  AND s.avatar_url != w.image_url;