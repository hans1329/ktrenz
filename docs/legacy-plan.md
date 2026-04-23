
# KTRENDZ V3 — 새 프로젝트 구성 계획

## 프로젝트 개요
기존 [ktrendz](/projects/7f3a24aa-a48a-477a-91e4-f991afc314d8) 프로젝트의 V3 핵심 기능(FES 랭킹 + Fan Agent)을 독립 프로젝트로 분리합니다. 동일한 Supabase 백엔드를 공유합니다.

---

## 1단계: 기반 구성
- 기존 ktrendz의 **Supabase 클라이언트 설정**을 그대로 가져와 연결 (동일 DB 사용)
- V3 다크 테마 CSS 스타일 복사
- 모바일/PC 반응형 레이아웃 구조 세팅

## 2단계: 메인 랭킹 페이지
- **V3Home** — 탭 기반 메인 페이지 (모바일: 하단 탭바, PC: 사이드바)
- **V3TrendRankings** — 실시간 트렌드 랭킹 리스트
  - 상위 3위 아티스트에 FES 반원 게이지 + Velocity/Intensity 바 표시
  - 전체 랭킹 리스트 with 스코어 바
- **V3Header** — 모바일 상단 헤더
- **V3TabBar** — 모바일 하단 탭 네비게이션
- **V3Sidebar** — PC 사이드 네비게이션

## 3단계: 아티스트 상세 페이지
- **V3ArtistDetail** — 아티스트별 상세 데이터 페이지
  - YouTube 데이터 (구독자, 조회수, 인기 비디오)
  - X(Twitter) Buzz 스코어 + 감성 분석
  - Music 스코어 (Last.fm, Deezer, MusicBrainz)
  - **FES 에너지 차트** (Velocity/Intensity 시계열 그래프)
  - Data Run(실시간 데이터 갱신) 버튼

## 4단계: Fan Agent
- **V3FanAgent** — AI 팬 에이전트 챗 인터페이스
  - 기존 Edge Function(`fan-agent-chat`) 연동

## 5단계: FES Engine 문서 페이지
- **/fes-engine** — 스코어링 로직 기술 문서 (한글)
  - Total Trend Score 공식
  - YouTube/Buzz/Music Score 산출 방식
  - FES(Fan Energy Score) = Velocity + Intensity 설명

## 6단계: 부가 컴포넌트
- **V3EnergyChart** — FES 에너지 시계열 차트
- **V3Treemap** — 트렌드 트리맵 시각화
- **ArtistListingRequestDialog** — 아티스트 등록 요청 다이얼로그
