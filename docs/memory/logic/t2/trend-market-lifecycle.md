# Memory: logic/t2/trend-market-lifecycle
Updated: now

트렌드 예측 마켓은 매일 00:00(KST) 추적(track) 시점을 기준으로 24시간 주기로 운영됨. 파이프라인 완료 후 `ktrenz-market-lifecycle` 함수가 자동 호출되어:
1. 만료된 오픈 마켓 정산 (리워드 지급)
2. active 상태 + baseline_score > 0인 키워드에 새 마켓 자동 생성

## 자동화 흐름
- detect → collect_social → track → **market-lifecycle** (end-of-pipeline)
- market-lifecycle: 만료 마켓 정산 → 새 마켓 일괄 오픈
- expires_at: 다음 날 00:00 KST (유저는 22:00 KST까지 예측 가능)

## 리워드 구조 (배팅 제거)
- 유저는 K-Token을 걸지 않음 (무료 참여)
- 구간 선택만으로 예측 참여 (마켓당 1회)
- 판정 기준: flat(<10%), mild(10~15%), strong(15~50%), explosive(50%+)
- 리워드: 소폭(100T), 강세(300T), 폭발(1,000T)
- 틀려도 참여 보상: 10T
- 추적 실패 시: 참여 보상 10T만 지급
- 마켓 미생성(추적 전) 상태: "곧 열려요!" 문구 + 남은 시간 표시
