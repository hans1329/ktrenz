# Memory: logic/t2/multi-source-tracking
Updated: now

## 5소스 멀티플랫폼 키워드 추적 (v7 — 가중치 재정규화)

추적 엔진(`ktrenz-trend-track`)은 키워드 단독으로 5개 플랫폼의 원본 측정값을 수집하고, **가용 소스 기반 가중치 재정규화**를 적용하여 미수집 소스에 의한 점수 왜곡을 방지함.

### 핵심 변경: null vs 0 구분
- `null` = 미수집 (API 키 없음, 쿼터 소진 등) → 가중치 풀에서 **제외**, 나머지 소스 가중치를 합계 1.0으로 재분배
- `0` = 수집했으나 결과 없음 → 유효 데이터로 **포함** (해당 소스에 활동 없음을 의미)

### 소스 및 기본 가중치
| 소스 | 기본 가중치 | API | 측정값 |
|------|-----------|-----|--------|
| 네이버 뉴스/블로그 | 0.25 | Naver Search API | total, 24h, 7d |
| 네이버 데이터랩 | 0.15 | Naver DataLab API | 검색 트렌드 ratio |
| 유튜브 | 0.25 | YouTube Data API v3 | videoCount, views, comments |
| 틱톡 | 0.20 | RapidAPI tiktok-api23 | videoCount, views, likes, comments |
| 인스타그램 | 0.15 | RapidAPI instagram-scraper-api2 | postCount, likes, comments |

### 재정규화 예시
YouTube 쿼터 소진 시 (4소스만 가용):
- 네이버: 0.25/0.75 = 0.333, 데이터랩: 0.15/0.75 = 0.200, 틱톡: 0.20/0.75 = 0.267, 인스타: 0.15/0.75 = 0.200

### buzz_score 스케일링
가용 소스 수에 비례하여 5소스 기준 100점으로 스케일링: `(소스별 로그합 / 가용소스수) × 5`

### 데이터 저장
- `ktrenz_trend_tracking`: 소스별 원본값 컬럼(null 허용) + source_scores + weighted_delta
- `raw_response.active_sources`: 각 소스 수집 여부 기록
- `raw_response.scoring_mode`: "multi_source_v7_renorm"
