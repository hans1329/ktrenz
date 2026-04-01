# Memory: infrastructure/t2/instagram-collection-logic
Updated: now

인스타그램 수집 API를 'instagram120 (3205)'로 전환 완료함. HOST: `instagram120.p.rapidapi.com`, 모든 요청은 POST 방식. 프로필 조회: `POST /api/instagram/profile` → `result.id`(pk), `result.edge_followed_by.count`(팔로워). 피드 조회: `POST /api/instagram/posts` → `result.edges[].node` 구조로 caption.text, like_count, comment_count, taken_at, image_versions2, location, usertags, code 등 제공. username 기반 직접 조회로 pk 룩업 단계 생략 가능하여 API 호출 절감. 기존 parseFeedItems 로직은 edges[].node 구조에 맞게 수정됨.
