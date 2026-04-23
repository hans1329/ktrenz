# Trend Grade System

## 등급 체계
Spark → React → Spread → Intent → Commerce → Explosive (6단계)

## Trend Score 공식 (키워드별)
- **Trend Score** = (Trend Energy × 0.35) + (Commercial Depth × 0.50) + (Momentum × 0.15)

### Trend Energy (실시간 유행성, 가중치 0.35)
= (Spark × React × Spread × Trend_Persistence)^(1/4)
- Spark: influence_index (cap 500)
- React: buzz_score_normalized
- Spread: source_breakdown 소스 수
- Trend_Persistence: 연속 추적 횟수 (interest_score > threshold)

### Commercial Depth (상업적 깊이, 가중치 0.50)
= (Intent × Commerce × Commercial_Persistence)^(1/3)
- Intent: purchase_stage 기반 (awareness=0.1 ~ review=1.0)
- Commerce: purchase_stage 기반 (consideration=0.2 ~ review=1.0)
- Commercial_Persistence: search_volume > 0인 추적 횟수
- **Commerce=0은 Commercial Depth에서만 영향** (기하평균 결과 0)

### Momentum Score (조기 신호, 가중치 0.15)
= normalized(|Velocity|) × normalized(|Acceleration|)
- Velocity < 0 (하락 중)이면 Momentum = 0

## Stage Gate
- Commerce 미도달 시: Trend Score = Energy(0.7) + Momentum(0.3), 라벨 "⚡ Emerging"

## 입력값 처리 규칙
- 모든 팩터: 카테고리 내 퍼센타일 랭크로 0~1 정규화
- 카테고리 내 5개 미만이면 0.5 기본값 사용
- Null (미도달): Stage Gate 적용으로 가중치 재정규화
- True Zero: 유효 데이터로 포함 (기하평균 결과 0 = 상업 전환 실패 신호)
- Persistence: 연속 추적 횟수 기반 (시간이 아닌 횟수)

## Star Influence Score (아티스트별)
- **Influence Score** = (Top 10 트렌드 평균 × 0.7 + 전체 평균 × 0.3) × log10(트렌드 수 + 1)

## 등급 산출 기반 데이터
- `purchase_stage`: AI detect 시 분류 (awareness, interest, consideration, purchase, review)
- `influence_index`: 베이스라인 대비 피크 비율
- `ktrenz_trend_tracking`: 시계열 스냅샷 (Velocity/Acceleration/Persistence 계산용)
- `trend_score`: 0~1 범위의 최종 점수 (ktrenz_trend_triggers 컬럼)
- `trend_score_details`: 서브스코어 상세 jsonb (ktrenz_trend_triggers 컬럼)

## 현재 구현 상태
- DB: `trend_score`, `trend_score_details` 컬럼 추가 완료
- DB: `ktrenz_trend_artist_grades`에 `influence_score`, `score_details` 컬럼 추가 완료
- Edge Function: `ktrenz-trend-grade` 퍼센타일 기반 Trend Score 공식 구현 완료
- Pipeline: `detect → grade → track → settle` 순서로 실행 중
- UI: `/t2/grades` 전용 뷰 생성 완료

## 수집 주기
- 6시간 간격, 하루 4회 (12:30, 18:30, 00:30, 06:30 KST)
- 2번째 수집 후 Velocity 계산 가능, 3번째 이후 Acceleration 가능
