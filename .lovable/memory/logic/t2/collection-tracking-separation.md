# Memory: logic/t2/collection-tracking-separation
Updated: now

## 아키텍처 원칙: 발견과 추적의 물리적 분리

### 수집(Detect) — `ktrenz-trend-detect`
- **역할**: 아티스트명으로 뉴스 검색 → AI 키워드 추출 → 저장
- **저장 대상**: `ktrenz_keywords` (키워드 마스터) + `ktrenz_keyword_sources` (아티스트-키워드 연결점)
- **하지 않는 것**: buzz score 수집, baseline 설정, peak/influence 계산, 만료 처리
- **호환성**: 기존 `ktrenz_trend_triggers`에도 동시 삽입 (baseline_score=0, peak_score=0)

### 추적(Track) — `ktrenz-trend-track`
- **역할**: `ktrenz_keywords`에서 active 키워드 조회 → "키워드 단독" 네이버 검색 → 시장 버즈 측정
- **첫 추적**: baseline_score와 peak_score를 첫 측정값으로 설정
- **이후 추적**: peak_score 갱신, influence_index 계산, 만료 판정
- **검색 방식**: "키워드 단독" 네이버 검색 (아티스트명 없이)
- **레거시 호환**: `ktrenz_trend_triggers`에도 baseline/peak/influence 동기화

### 파이프라인 순서 (ktrenz-trend-cron)
`collect_social → detect → detect_youtube → (postprocess+grade) → track`
- detect 계열 완료 후 postprocess/grade 실행
- track은 파이프라인 최종 단계에서 실행

### 테이블 구조
| 테이블 | 역할 |
|--------|------|
| `ktrenz_keywords` | 키워드 마스터 (1 keyword = 1 row, 점수/등급 포함, baseline/peak/influence 저장) |
| `ktrenz_keyword_sources` | 발견 연결점 (어떤 아티스트+기사로 발견했는지) |
| `ktrenz_trend_tracking` | 추적 이력 (keyword_id 참조, 각 주기별 buzz score 기록) |
| `ktrenz_trend_triggers` | 레거시 호환 (기존 UI/알림과 연동, 점진적 마이그레이션 대상) |
