# Memory: logic/t2/noise-filtering-logic
Updated: now

트렌드 감지 엔진은 4단계 노이즈 필터링을 적용함:

## 1. 명시적 블랙리스트 (INSERT_NOISE_BLACKLIST)
- 일반 노이즈 단어 (브랜드평판, 아이돌, 컴백 등)
- 지역명 (서울, 도쿄 등)
- 알려진 오탐 키워드 (바비스모, 엑소시스템즈 등)
- **일반명사/카테고리 설명어**: 뮤직비디오, 럭셔리 뷰티 브랜드, 사복패션, 화보, 광고, 굿즈 등 트렌드 가치 없는 일반 용어

## 2. 기업명 패턴 필터 (CORP_SUFFIXES)
- 기업용 접미사 (시스템즈, 테크, 바이오, 제약, holdings, inc 등)

## 3. 의약품/화학물질 패턴 필터 (PHARMA_SUFFIXES)
- INN(국제일반명) 명명 규칙 접미사 (스모, 맙, 닙, 졸, mab, nib, zol 등)

## 4. AI 프롬프트 계층 (generic_word rejection_flag)
- GENERIC COMMON NOUNS 규칙으로 AI가 일반명사를 generic_word로 플래깅
- hardRejectFlags에 포함되어 자동 차단

## 적용 위치
- AI 추출 직후: rejection_flags 기반 차단 (generic_word)
- 키워드 삽입 직전: INSERT_NOISE_BLACKLIST + isCorpOrPharmaKeyword() 검사
