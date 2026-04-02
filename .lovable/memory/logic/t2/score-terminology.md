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

### 배팅(예측) 정산 기준
- 마켓 생성 시 `initial_influence`(= 그 시점의 influence_index) 저장
- 24시간 후 현재 influence_index와 비교하여 **트렌드 점수의 변동폭**으로 판정
- mild: +0~15%, strong: +15~100%, explosive: +100%+
