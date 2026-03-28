# Memory: logic/t2/shopping-tracking-composite
Updated: now

상업적 카테고리(`brand`, `product`, `goods`) 키워드의 쇼핑 데이터는 `ktrenz_shopping_tracking` 별도 테이블에 저장됨. 트렌드 점수(interest_score)는 모든 키워드와 동일하게 뉴스/블로그 버즈 기반으로 산정하며, 쇼핑 데이터(DataLab 검색 트렌드 + 네이버 쇼핑 상품수)는 분리된 테이블에서 독립적으로 관리됨. 어드민 쇼핑 키워드 관리 페이지에서 수동 추적 시에도 이 별도 테이블에 기록됨.
