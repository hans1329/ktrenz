# Memory: features/t2/social-media-integration
Updated: now

인스타그램 및 틱톡 데이터 수집은 RapidAPI를 활용함. 틱톡은 `tiktok-api23` 서비스로 `collect-tiktok-trends`에서 데이터를 수집한 뒤, `ktrenz-trend-detect` 파이프라인에서 AI 분류를 통해 소셜 트렌드 키워드를 추출하여 `keyword_category='social'`, `trigger_source='tiktok'`으로 저장함. AI는 TikTok 영상 설명에서 바이럴 챌린지, 트렌딩 해시태그, 댄스 트렌드, 팬 콘텐츠 트렌드를 식별하며, 제네릭 태그(#fyp, #kpop 등)는 필터링함. 소셜 키워드는 Naver buzz 조회를 건너뛰고 baseline_score=10으로 설정됨. 인스타그램은 적합한 해시태그 검색 API 추가 선정 중.
