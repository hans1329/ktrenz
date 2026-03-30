# Memory: logic/t2/tracking-policy
Updated: now

트렌드 추적 엔진은 `ktrenz_pipeline_state` 기반의 데이터베이스 스테이트 머신을 사용하여 모든 활성 키워드를 중단 없이 배치 처리함. **감지(detect)는 "아티스트명+키워드"로 검색하여 키워드를 확보하고 baseline_score를 기록하며, 추적(track)은 "키워드만" 단독 검색하여 아티스트와 무관한 시장 전체의 버즈량 변화를 측정함.** 이로써 아티스트가 해당 키워드를 얼마나 키웠는지(영향력)를 정확히 산정할 수 있음. 쇼핑 카테고리(`brand`, `product`, `goods`) 키워드는 추가로 `ktrenz_shopping_tracking` 별도 테이블에 DataLab 검색량과 네이버 쇼핑 상품수를 수집·저장하여 트렌드 점수와 쇼핑 데이터를 완전히 분리함. `baseline_score`가 0인 키워드도 최소 1회 추적을 수행하여 기준점을 수립함.
