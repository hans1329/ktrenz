# Memory: logic/t2/classification-rules
Updated: now

모든 비소셜 키워드는 naver_news 소스로 통합 관리하며, UI 분류는 category 필드를 기준으로 함. '인천공항', '공항패션' 등은 지리적 장소가 아닌 'fashion' 카테고리로 분류하여 수집하며, 쇼핑 전용 탭은 category === 'shopping' 필터를 사용함.

**restaurant 카테고리**: SNS(X, Instagram) 및 뉴스 크롤링에서 감지된 레스토랑, 카페, 바, 베이커리 등 구체적 외식업소는 'restaurant' 카테고리로 분류함. 'food'는 식품 브랜드/가공식품용, 'place'는 비외식 장소용으로 구분함.
