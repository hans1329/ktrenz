# Memory: logic/t2/article-subject-validation
Updated: now

트렌드 후처리(postprocess) 단계에서 **모든 star_type(group, member, solo)**에 대해 AI 주체 검증을 수행함:
1. **그룹**: 기존 로직 유지 — 키워드가 그룹 활동인지 특정 멤버 개인 활동인지 판별하여 멤버 귀속(re-attribution) 처리
2. **멤버/솔로**: 신규 추가 — 기사가 실제로 해당 아티스트에 대한 것인지 검증(`is_valid`). 동명이인(예: SHINee 민호 vs Stray Kids 리노/민호), 다른 그룹 멤버 기사, 단순 언급에 불과한 경우를 `is_valid: false`로 판정하여 만료 처리
3. **Sibling Member Filter**: 동일 그룹의 다른 멤버 이름 목록을 AI에 제공하여 혼동 방지
4. **이름 필터링**: AI 호출 전 코드 레벨에서 순수 이름 키워드를 사전 제거하고, 남은 것만 AI에 전달
