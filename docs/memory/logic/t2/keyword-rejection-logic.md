# Memory: logic/t2/keyword-rejection-logic
Updated: now

키워드 데이터 정합성을 위해 **글로벌 스타 DB 기반 동적 검증 시스템**을 운영함.

## 핵심 아키텍처: AI 프롬프트에 스타 DB 주입
- 함수 시작 시 `ktrenz_stars` 테이블에서 모든 active 스타(group/solo/member)의 `display_name`, `name_ko`를 로드하여 `globalStarNames` Map 생성
- AI 시스템 프롬프트에 "KNOWN STARS IN OUR DATABASE" 섹션으로 전체 스타 목록을 주입
- AI가 기사 분석 시 이 목록을 참조하여:
  1. 기사 주체가 검색 대상이 아닌 다른 스타인 경우 `wrong_artist` 플래그 설정
  2. 키워드가 스타 이름인 경우 추출 거부
  3. 크로스 오염(다른 스타 기사에서 키워드 추출) 감지

## 3단계 필터링 파이프라인
1. **AI 툴콜링 단계**: 프롬프트에 주입된 스타 DB로 기사 주체 검증 + rejection_flags 생성
   - **기업/제약 패턴 차단 규칙**: 프롬프트에 CORPORATE/PHARMA NAME TRAP 섹션 추가
   - 기업 접미사(시스템즈, 테크, holdings 등), 제약 접미사(스모, 맙, mab 등) 패턴을 AI가 직접 인식하여 noise 플래그 설정
2. **코드 레벨 후처리**: `globalStarNames` Map으로 키워드-스타이름 정확 매칭 필터 (extractCommercialKeywords 내부)
3. **삽입 단계 필터**: `globalStarNames` + `artistNameSet`(멤버 변형 포함)으로 최종 차단 + `isCorpOrPharmaKeyword()` 패턴 필터

## 기존 검증 (유지)
- `collectNameVariants`를 통한 현재 아티스트/멤버 이름 블랙리스트
- `article_subject_match`, `ownership_confidence` 기반 구조적 검증
- `non_kstar_subject` 플래그로 비연예인 주체 기사 차단
- 소스 기사 텍스트에 아티스트 이름 포함 여부 코드 레벨 검증

## 하드코딩 블랙리스트는 보조적 역할만
- PLATFORM_BLACKLIST, AGENCY_BLACKLIST_PATTERNS: 플랫폼/소속사명 차단
- INSERT_NOISE_BLACKLIST: 일반 노이즈 단어 차단
- 이들은 AI + 스타 DB 검증의 보완재이며, 주요 필터링은 AI 크로스체크가 담당
