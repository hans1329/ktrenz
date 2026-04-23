# Memory: infrastructure/t2/k2-pipeline-architecture
Updated: now

## K2 파이프라인 정의
현재 T2 시스템의 데이터 수집-점수 산정 파이프라인을 **K2**로 규정함.

## 데이터 소스
- **네이버 뉴스/블로그** 기반 키워드 감지가 유일한 수집 소스
- YouTube/Music/Buzz 등 별도 메트릭 수집은 하지 않음
- `ktrenz_data_snapshots` 테이블은 K2에서 사용하지 않음 (비어있음)

## 점수 체계 (star_id 기반 ✅)

### 1. 키워드 레벨 — `ktrenz_trend_triggers`
| 컬럼 | 설명 |
|------|------|
| `trend_score` | 키워드 트렌드 스코어 (0~1, Energy×0.35 + Commercial×0.50 + Momentum×0.15) |
| `trend_grade` | 6단계 등급 (spark → react → spread → intent → commerce → explosive) |
| `influence_index` | (peak/baseline - 1) × 100 — 키워드 성장률 |
| `baseline_score` | 뉴스/블로그 버즈 기준점 |
| `peak_score` | 최고 버즈 점수 |
| `star_id` | ✅ ktrenz_stars FK 연결 |
| `trigger_source` | 모든 비-social 키워드는 `naver_news` (social → `tiktok`) |

### 2. 쇼핑 데이터 — `ktrenz_shopping_tracking` (별도 테이블)
| 컬럼 | 설명 |
|------|------|
| `trigger_id` | ktrenz_trend_triggers FK |
| `star_id` | ktrenz_stars FK |
| `datalab_ratio` | 네이버 DataLab 검색 트렌드 (0~100) |
| `shop_total` | 네이버 쇼핑 상품 등록 수 |
| `composite_score` | DataLab(60%) + 상품수(40%) 복합 점수 |
- 쇼핑 카테고리(brand, product, goods) 키워드만 추가 수집
- 트렌드 점수(interest_score)와 완전 분리

### 3. 아티스트 레벨 — `ktrenz_trend_artist_grades`
| 컬럼 | 설명 |
|------|------|
| `influence_score` | KIS (Keyword Influence Score) — (Top10avg×0.7 + Allavg×0.3) × log10(count+1) |
| `grade` | 아티스트 최고 등급 (키워드 등급 중 최대) |
| `grade_score` | 전체 키워드 평균 점수 (0~100) |
| `keyword_count` | 활성 키워드 수 |
| `star_id` | ✅ ktrenz_stars FK 연결 |

### 4. 스타 테이블 — `ktrenz_stars` (SSOT)
- **KIS/influence_score는 ktrenz_stars에 직접 저장하지 않음** — `ktrenz_trend_artist_grades`에서 star_id로 조인

## 수집-점수 흐름
```
[cron 6h] → detect (네이버 뉴스/블로그)
  → ktrenz_trend_triggers (pending, trigger_source=naver_news)
  → postprocess (AI 분류, 브랜드매칭, 중복제거)
  → ktrenz_trend_triggers (active)
  → track (뉴스/블로그 버즈 점수 산정 → ktrenz_trend_tracking)
       └→ 쇼핑 카테고리: 추가로 DataLab+상품수 → ktrenz_shopping_tracking
  → trend-grade (trend_score, trend_grade 산정, tiktok 제외)
  → ktrenz_trend_artist_grades (KIS, grade 집계)
```
