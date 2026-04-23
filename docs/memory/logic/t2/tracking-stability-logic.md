# Memory: logic/t2/tracking-stability-logic
Updated: now

트렌드 추적 v8은 이중 변동률 체계를 사용함:
- **delta_pct** (delta_from_baseline): 베이스값(첫 수집 시 저장된 baseline_raw) 대비 현재값의 변동률 → 장기 성장률 지표
- **velocity**: 직전 수집값(prevRaw) 대비 현재값의 변동률 → 단기 추세 방향 지표
- 두 지표 모두 ±500% cap 적용
- 첫 수집(First Track)이면 delta_pct=0, velocity=0으로 설정
- AI 컨텍스트 갱신은 추적 단계에서 수행하지 않음 (수집 단계에서만 생성)
- 모멘텀 시그널 등 UI에서는 velocity 기반으로 단기 급등/급락 감지
