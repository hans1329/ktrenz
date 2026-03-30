# Memory: constraints/t2-k2-system-boundaries
Updated: now

## T2/K2 시스템 절대 원칙 — 위반 시 즉시 정정

### 1. 데이터 기반: `ktrenz_stars` 테이블 단독
- T2/K2 파이프라인의 아티스트 대상은 **오직 `ktrenz_stars` 테이블**에서 조회함
- `wiki_entries` 테이블은 T2/K2에서 **사용하지 않음** (레거시 k-trendz.com 전용)
- `ktrenz_stars.is_active = true`인 모든 아티스트가 수집/추적 대상
- **tier 개념 없음** — tier 1/2/3 분류나 tier 기반 필터링은 T2/K2에 존재하지 않음

### 2. V3 코드와의 관계
- V3 컴포넌트/로직은 T2/K2 파이프라인과 **완전 독립**
- V3 기반 코드를 T2/K2 로직에 참조하거나 혼용하지 않음
- wiki_entry_id 기반 조인/필터는 T2/K2에서 사용 금지

### 3. 키워드 저장 구조
- 키워드 마스터: `ktrenz_keywords` (고유 키워드, 통합 점수)
- 발견 컨텍스트: `ktrenz_keyword_sources` (어떤 아티스트를 통해 발견됐는지)
- 추적 시계열: `ktrenz_trend_tracking` (소스별 원본값, 5소스 병렬)
- 쇼핑 추적: `ktrenz_shopping_tracking` (쇼핑 카테고리 키워드 전용)

### 4. 파이프라인 순서
`collect_social → detect → detect_youtube → track → (settle, grade, etc.)`
- 모든 단계는 `ktrenz_pipeline_state` DB 상태머신으로 관리
- 함수 간 직접 호출 금지, DB 기반 배치 처리

### 5. 자주 하는 실수 — 절대 금지
- ❌ "tier 1 아티스트만 대상" → `ktrenz_stars`에 tier 없음
- ❌ "wiki_entry_id가 있는 스타만" → wiki_entry 필터 없음
- ❌ "V3 기반 로직 참조" → T2/K2와 무관
- ❌ "기존 k-trendz.com 테이블 수정" → 신규 ktrenz_ 접두사 테이블만 사용
