# Data Source Unity — star_id SSOT 전환 완료

## 정책
- T2 파이프라인의 **모든 함수**는 `star_id`를 유일한 식별자로 사용
- `wiki_entry_id`는 DB 컬럼으로 존재하나 **항상 null**로 설정 (더 이상 참조하지 않음)
- V1(data-engine) 및 V3(v3_scores_v2, v3_artist_tiers, v3_energy_snapshots_v2) 테이블 **참조 금지**
- 소셜 수집(Instagram/TikTok)도 T2 파이프라인에 통합 완료 (`collect_social` phase)

## 전환 완료된 함수
- `ktrenz-trend-detect`: MemberInfo에서 group_wiki_entry_id 제거, 레거시 wikiEntryId 경로 제거
- `ktrenz-trend-detect-youtube`: 동일 패턴 적용
- `ktrenz-trend-track`: tracking 레코드 insert 시 wiki_entry_id: null 고정
- `ktrenz-trend-postprocess`: wiki_entry_id 미사용 확인 완료
- `ktrenz-trend-grade`: wiki_entry_id 미사용 확인 완료
- `ktrenz-schedule-predict`: wikiEntryId fallback 경로 제거, starId만 지원
- `collect-tiktok-trends`: v3_scores_v2 업데이트 로직 전체 삭제, wiki_entry_id: null 고정
- `collect-instagram-trends`: 이미 star_id 기반, wiki_entry_id: null 확인 완료
- `ktrenz-collect-social`: T2 전용 신규 오케스트레이터

## 파이프라인 순서
`collect_social → detect → track → (postprocess → grade → settle)`
