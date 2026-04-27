# Memory: logic/t2/collection-tracking-separation
Updated: now

## 아키텍처 원칙: 발견과 추적의 물리적 분리

### 수집(Detect) — `ktrenz-trend-detect` / `ktrenz-trend-detect-youtube`
- **역할**: 아티스트명으로 뉴스/유튜브 검색 → AI 키워드 추출 → **active 상태로 즉시 저장**
- **저장 대상**: `ktrenz_keywords` (키워드 마스터) + `ktrenz_keyword_sources` (아티스트-키워드 연결점)
- **하지 않는 것**: buzz score 수집, baseline 설정, peak/influence 계산, 만료 처리
- **호환성**: 기존 `ktrenz_trend_triggers`에도 동시 삽입 (baseline_score=0, peak_score=0, status=active)
- **pending 폐지**: 수집 단계에서 바로 active로 삽입. 후처리 완료 여부는 `postprocessed_at` 컬럼으로 판별

### 후처리(Postprocess) — `ktrenz-trend-postprocess`
- **역할**: `postprocessed_at IS NULL`인 active 엔트리 대상으로 AI 재분류, 중복 제거, 브랜드 매핑 수행
- **완료 마킹**: 처리 완료 시 `postprocessed_at = now()` 설정 (상태 변경 없음)

### 추적(Track) — `ktrenz-trend-track`
- **역할**: `ktrenz_keywords`에서 active 키워드 조회 → "키워드 단독" 네이버 검색 → 시장 버즈 측정
- **첫 추적**: baseline_score와 peak_score를 첫 측정값으로 설정
- **이후 추적**: peak_score 갱신, influence_index 계산, 만료 판정

### 파이프라인 순서 (ktrenz-trend-cron)
`collect_social → detect → detect_youtube → (postprocess+grade) → track`

### 테이블 구조
| 테이블 | 역할 |
|--------|------|
| `ktrenz_keywords` | 키워드 마스터 (1 keyword = 1 row, 점수/등급 포함, postprocessed_at 마커) |
| `ktrenz_keyword_sources` | 발견 연결점 (어떤 아티스트+기사로 발견했는지) |
| `ktrenz_trend_tracking` | 추적 이력 (keyword_id 참조, 각 주기별 buzz score 기록) |
| `ktrenz_trend_triggers` | 레거시 호환 (기존 UI/알림과 연동, postprocessed_at 마커) |
