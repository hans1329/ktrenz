# Memory: infrastructure/t2/multi-source-tracking
Updated: now

## 5소스 멀티플랫폼 키워드 추적 (v6)

추적 엔진(`ktrenz-trend-track`)은 키워드 단독으로 5개 플랫폼의 원본 측정값을 수집하고, 이전 주기 대비 변화율(delta%)을 가중 합산하여 종합 influence를 산출함.

### 소스 및 가중치
| 소스 | 가중치 | API | 측정값 |
|------|--------|-----|--------|
| 네이버 뉴스/블로그 | 0.25 | Naver Search API (무료) | total, 24h, 7d |
| 네이버 데이터랩 | 0.15 | Naver DataLab API (무료) | 검색 트렌드 ratio |
| 유튜브 | 0.25 | YouTube Data API v3 (무료 쿼터) | videoCount, views, comments |
| 틱톡 | 0.20 | RapidAPI tiktok-api23 | videoCount, views, likes, comments |
| 인스타그램 | 0.15 | RapidAPI instagram-scraper-api2 | postCount, likes, comments |

### 점수 산출 방식
- **정규화 없음**: 원본값 그대로 저장, delta% 비교로 스케일 차이 해소
- **소스별 활동량**: 각 소스의 원본 측정값을 단일 활동량 수치로 합산
- **가중 delta**: `Σ(소스별 delta% × 가중치)` = weighted_delta
- **buzz_score**: 5소스 활동량의 로그 스케일 합산 (0~100)
- **influence_index**: `(peak - baseline) / baseline × 100`

### 데이터 저장
- `ktrenz_trend_tracking`: 소스별 원본값 컬럼(naver_news_total, youtube_total_views 등) + source_scores(jsonb) + weighted_delta
- `ktrenz_keywords`: baseline_raw/peak_raw(jsonb)로 첫 추적/피크 시점의 소스별 원본값 보존

### 핵심 원칙
- 추적은 **키워드 단독** — star_id 불필요, 모든 검색은 키워드만으로 수행
- 수집(detect)과 추적(track)은 물리적 분리 유지
- 5소스 병렬 호출로 속도 최적화
