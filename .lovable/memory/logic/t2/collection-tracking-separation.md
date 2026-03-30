# Memory: logic/t2/collection-tracking-separation
Updated: now

## 아키텍처 원칙: 발견과 추적의 물리적 분리

### 수집(Detect) — `ktrenz-trend-detect`
- **역할**: 아티스트명으로 뉴스 검색 → AI 키워드 추출 → 저장
- **저장 대상**: `ktrenz_keywords` (키워드 마스터) + `ktrenz_keyword_sources` (아티스트-키워드 연결점)
- **하지 않는 것**: buzz score 수집, baseline 설정, peak/influence 계산, 만료 처리
- **호환성**: 기존 `ktrenz_trend_triggers`에도 동시 삽입 (baseline_score=0, peak_score=0)

### 추적(Track) — `ktrenz-trend-track`
- **역할**: 기존 active 키워드의 "키워드 단독" 버즈량 측정
- **설정**: baseline_score, peak_score, influence_index, 만료 판정
- **검색 방식**: "키워드 단독" 네이버 검색 (아티스트명 없이)

### 테이블 구조
| 테이블 | 역할 |
|--------|------|
| `ktrenz_keywords` | 키워드 마스터 (1 keyword = 1 row, 점수/등급 포함) |
| `ktrenz_keyword_sources` | 발견 연결점 (어떤 아티스트+기사로 발견했는지) |
| `ktrenz_trend_triggers` | 레거시 호환 (기존 UI/track과 연동, 점진적 마이그레이션 대상) |
