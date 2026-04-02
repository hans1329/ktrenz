# Memory: logic/t2/score-terminology
Updated: now

## 점수 용어 정의

### Trend Score (트렌드 점수) — 키워드 단위
- 키워드의 시장 확산도와 상업적 깊이를 종합한 점수
- DB: `ktrenz_trend_triggers.trend_score` (0~1 범위 최종 점수)
- 내부 계산 지표: `influence_index` (baseline 대비 peak 비율), `buzz_score`, `delta_pct`, `velocity`
- **`influence_index`는 DB 컬럼명이지만 개념적으로는 트렌드 점수의 하위 지표임**

### Influence Score (인플루언스 점수) — 아티스트 단위
- 아티스트가 보유한 트렌드 키워드들의 종합 영향력
- DB: `ktrenz_trend_artist_grades.influence_score`
- 공식: (Top 10 트렌드 평균 × 0.7 + 전체 평균 × 0.3) × log10(트렌드 수 + 1)

### 예측 시스템 구조 (배팅 제거, 리워드 기반)
- **참여 방식**: 유저는 K-Token 배팅 없이 구간만 선택하여 예측 참여
- **틀려도 참여 보상**: 10T 지급 (flat 구간 포함)
- **예측 가능 3구간**:
  - `mild` (소폭 상승): +10% ~ +15%, 리워드 100T
  - `strong` (강세): +15% ~ +50%, 리워드 300T
  - `explosive` (폭발): +50%+, 리워드 1,000T
- **loss zone**: < +10% 변동 → 모든 예측 실패, 참여 보상 10T만 지급
- 유저는 오를 구간에만 예측 → 안 오르면 실패하되 10T 위로금
- 마켓 생성 시 `initial_influence`(= 그 시점의 influence_index) 저장
- 24시간 후 현재 influence_index와 비교하여 변동률로 판정
