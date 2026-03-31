# Memory: logic/t2/noise-filtering-logic
Updated: now

트렌드 감지 엔진은 3단계 노이즈 필터링을 적용함:

## 1. 명시적 블랙리스트 (INSERT_NOISE_BLACKLIST)
- 일반 노이즈 단어 (브랜드평판, 아이돌, 컴백 등)
- 지역명 (서울, 도쿄 등)
- 알려진 오탐 키워드 (바비스모, 엑소시스템즈 등)

## 2. 기업명 패턴 필터 (CORP_SUFFIXES)
- 기업용 접미사 (시스템즈, 테크, 바이오, 제약, holdings, inc 등)
- 아티스트명 + 기업 접미사 조합의 오탐 방지 (예: 엑소시스템즈 ≠ EXO)

## 3. 의약품/화학물질 패턴 필터 (PHARMA_SUFFIXES)
- INN(국제일반명) 명명 규칙 접미사 (스모, 맙, 닙, 졸, mab, nib, zol 등)
- 아티스트명 + 약품 접미사 조합의 오탐 방지 (예: 바비스모 ≠ 바비/Bobby)
- 최소 길이 제한으로 정상 키워드 오차단 방지

## 적용 위치
- 키워드 삽입 직전 단계 (candidateRows 순회 시)에서 `isCorpOrPharmaKeyword()` 함수로 검사
- keyword, keyword_ko, keyword_en 모두 체크
