# Memory: features/t2/social-media-integration
Updated: now

인스타그램 및 틱톡 데이터 수집은 RapidAPI를 활용함. 양 플랫폼 모두 AI(GPT-4o-mini)를 통한 키워드 추출을 수행하여 `ktrenz_trend_triggers`에 `trigger_source='instagram'` 또는 `trigger_source='tiktok'`으로 저장함. 틱톡은 영상 설명(desc)과 해시태그에서 바이럴 챌린지, 브랜드, 패션, 뷰티 등 상업적 키워드를 추출하며, 인스타그램은 피드/스토리/위치태그/멘션에서 동일한 카테고리로 추출함. 소셜 키워드는 `baseline_score=10`으로 설정되고, 3일간 중복 방지 룩백을 적용함. 틱톡은 추가로 `ktrenz_social_snapshots`에 통계(조회수/좋아요 등)도 저장함. 두 소스 모두 `collect_social` 단계에서 수집되며, 추출된 키워드는 postprocess → grade → track 흐름을 자동으로 탐.
