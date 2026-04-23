# Memory: infrastructure/collection/naver-shopping-constraint
Updated: now

트렌드 감지 파이프라인(`ktrenz-trend-detect`)에서 네이버 쇼핑(Shopping) API 수집 로직이 재활성화됨. 아티스트명으로 쇼핑 검색하여 상품명에서 브랜드/제품 키워드를 규칙 기반으로 추출(extractShopKeywords)하며, AI 추출 키워드와 병합(중복 제거)하여 상업적 카테고리(brand, product, fashion, beauty) 키워드 발굴을 보조함. 추가로 패션/뷰티 전문 매체 보강 검색("화보 OR 앰배서더 OR 브랜드 OR 패션 OR 뷰티")도 병렬로 수행하여 일반 뉴스에 병합함. ownership_confidence 임계값은 상업 카테고리(brand, fashion, beauty, product, restaurant, food)에 한해 0.3으로 완화(기본 0.5).
