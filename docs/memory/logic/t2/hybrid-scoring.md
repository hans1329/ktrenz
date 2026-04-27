# Memory: logic/t2/hybrid-scoring
Updated: now

소셜 소스(틱톡/인스타그램)에서 발굴된 키워드는 하이브리드 점수 체계로 추적함. 소셜 자체 지표(activity_score, 0~100) 50%와 네이버 뉴스/블로그 버즈(정규화 0~100) 50%를 합산하여 최종 interest_score를 산출함. 이를 통해 소셜에서만 뜨거운 키워드도, 뉴스까지 번진 키워드도 모두 포착 가능. 네이버 기반 키워드(naver_news, youtube)는 기존 raw buzz score 방식 유지. 소셜 점수는 `ktrenz_social_snapshots`의 최신 스냅샷에서 `tiktok_activity_score` 또는 `instagram_activity_score`를 참조함. 또한 소셜 소스 키워드는 `source_image_url`에 원본 콘텐츠 이미지(인스타 미디어/틱톡 커버)를 저장하여 UI에서 직접 활용함.
