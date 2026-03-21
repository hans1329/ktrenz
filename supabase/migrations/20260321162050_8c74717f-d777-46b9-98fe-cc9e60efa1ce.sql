-- 아티스트 이름과 완전 일치하는 키워드를 expired 처리
UPDATE ktrenz_trend_triggers t
SET status = 'expired'
FROM ktrenz_stars s
WHERE t.star_id = s.id
  AND t.status IN ('active', 'pending')
  AND (
    lower(t.keyword) = lower(s.display_name)
    OR lower(t.keyword_ko) = lower(s.name_ko)
    OR lower(t.keyword) = lower(s.name_ko)
    OR lower(t.keyword_ko) = lower(s.display_name)
  );