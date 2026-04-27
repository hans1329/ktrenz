# Memory: logic/t2/tracking-policy
Updated: now

트렌드 추적 엔진은 `ktrenz_pipeline_state` 기반의 데이터베이스 스테이트 머신을 사용하여 모든 활성 키워드를 중단 없이 배치 처리함. **감지(detect)는 "아티스트명+키워드"로 검색하여 키워드를 확보하되, baseline_score는 "키워드 단독" 네이버 검색(시장 전체 버즈)으로 설정함. 추적(track)도 "키워드 단독"으로 검색하여 동일 스케일로 시장 버즈 변화를 측정함.** 이로써 아티스트는 수집 시 연결점으로만 작용하고, 이후 트렌드 스코어는 키워드 중심의 시장 확산성으로 산출됨. 쇼핑 카테고리(`brand`, `product`, `goods`) 키워드는 추가로 `ktrenz_shopping_tracking` 별도 테이블에 DataLab 검색량과 네이버 쇼핑 상품수를 수집·저장하여 트렌드 점수와 쇼핑 데이터를 완전히 분리함.
