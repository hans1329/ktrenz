# Trend Grade System

## 등급 체계
Spark → React → Spread → Persistence → Intent → Commerce (6단계)

## Trend Score 공식 (키워드별)
- **Trend Energy (가중치 0.3)** = (Spark × React × Spread × Velocity)^(1/4)
- **Commercial Depth (가중치 0.5)** = (Intent × Commerce × Persistence)^(1/3)
- **Momentum (가중치 0.2)** = Velocity(dX/dt) × Acceleration(d²X/dt²)
- **Trend Score** = (Trend Energy × 0.3) + (Commercial Depth × 0.5) + (Momentum × 0.2)

## Star Influence Score (아티스트별)
- Top-N 가중 평균 + 트렌드 개수 보정
- **Influence Score** = (Top 10 트렌드 평균 × 0.7) + (전체 트렌드 평균 × 0.3) × log(트렌드 수 + 1)

## 등급 산출 기반 데이터
- `purchase_stage`: AI detect 시 분류 (awareness, interest, consideration, purchase, review)
- `influence_index`: 베이스라인 대비 피크 비율
- `ktrenz_trend_tracking`: 시계열 스냅샷 (Velocity/Acceleration 계산용)

## 현재 구현 상태
- DB 테이블: `ktrenz_trend_triggers`에 `purchase_stage`, `trend_grade` 컬럼 추가 완료
- DB 테이블: `ktrenz_trend_artist_grades` 테이블 생성 완료
- Edge Function: `ktrenz-trend-grade` 생성 완료 (현재는 단순 임계값 기반)
- Pipeline: `detect → grade → track → settle` 순서로 실행 중
- UI: `/t2/grades` 전용 뷰 생성 완료

## Phase 1 (대기 중 - 2번째 수집 데이터 확인 후 진행)
- Velocity/Acceleration 제외한 Trend Score 계산 구현
- `ktrenz-trend-grade` 함수를 서브스코어 기반 공식으로 확장
- Star Influence Score 계산 로직 추가
- UI에서 influence_index → Trend Score로 표시 전환

## Phase 2 (3번째 수집 이후)
- Velocity (2개 스냅샷 간 api_total 차이) 활성화
- Acceleration (Velocity 변화율) 활성화 → Momentum 항 완전 가동

## 수집 주기
- 6시간 간격, 하루 4회 (12:30, 18:30, 00:30, 06:30 KST)
- 2번째 수집 후 Velocity 계산 가능, 3번째 이후 Acceleration 가능
