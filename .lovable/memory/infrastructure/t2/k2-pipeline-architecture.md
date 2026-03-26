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
| `baseline_score` | 네이버 검색량 기준점 |
| `peak_score` | 최고 검색량 |
| `star_id` | ✅ ktrenz_stars FK 연결 |

### 2. 아티스트 레벨 — `ktrenz_trend_artist_grades`
| 컬럼 | 설명 |
|------|------|
| `influence_score` | KIS (Keyword Influence Score) — (Top10avg×0.7 + Allavg×0.3) × log10(count+1) |
| `grade` | 아티스트 최고 등급 (키워드 등급 중 최대) |
| `grade_score` | 전체 키워드 평균 점수 (0~100) |
| `keyword_count` | 활성 키워드 수 |
| `grade_breakdown` | 등급별 분포 (jsonb) |
| `score_details` | 상세 점수 내역 (jsonb) |
| `star_id` | ✅ ktrenz_stars FK 연결 |
| `computed_at` | 마지막 계산 시점 |

### 3. 스타 테이블 — `ktrenz_stars` (SSOT)
| 컬럼 | 용도 |
|------|------|
| `last_detected_at` | 마지막 감지 시점 |
| `last_detect_result` | 감지 결과 요약 (jsonb: news, blog, shop, keywords, inserted, tracked) |
| `influence_categories` | 영향력 카테고리 배열 |
- **KIS/influence_score는 ktrenz_stars에 직접 저장하지 않음** — `ktrenz_trend_artist_grades`에서 star_id로 조인

## 수집-점수 흐름
```
[cron 6h] → detect (네이버 뉴스/블로그)
  → ktrenz_trend_triggers (pending)
  → postprocess (AI 분류, 브랜드매칭, 중복제거)
  → ktrenz_trend_triggers (active)
  → track (baseline/peak 갱신, influence_index 계산)
  → trend-grade (trend_score, trend_grade 산정)
  → ktrenz_trend_artist_grades (KIS, grade 집계)
```

## star_id 전환 상태
- `ktrenz_trend_triggers`: ✅ 166/166 star_id 보유
- `ktrenz_trend_artist_grades`: ✅ star_id 컬럼만 존재 (wiki_entry_id 없음)
- `ktrenz_stars`: ✅ SSOT
- `ktrenz_schedule_predictions`: star_id 컬럼 있으나 데이터 0건
