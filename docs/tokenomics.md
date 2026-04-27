# KTrenZ Tokenomics 기획서

> **Version**: v1.0 (Draft)
> **Last Updated**: 2026-04-27
> **Status**: 검토 중 — VBI ICO 전 확정 목표

---

## 0. Executive Summary

KTrenZ는 K-pop 콘텐츠 momentum을 분석해 트렌드의 다음 흐름을 예측하는 게임입니다.
$KTNZ는 이 생태계의 **단일 토큰**으로, Base 체인에 배포된 ERC-20입니다.

| 항목 | 내용 |
|---|---|
| 토큰명 | **$KTNZ** |
| 체인 | Base (Ethereum L2) |
| 총 공급 | **5,000,000,000 (5B)** 고정 |
| 표준 | ERC-20, 18 decimals |
| Pre-mint | 750M (15%) — 이미 발행 |
| Activity Mining | 4.25B (85%) — 10년 분할 발행 |
| ICO | VBI 플랫폼 (225M 매도) |
| 핵심 전략 | **Web2/Web3 이중 트랙** + 강력한 Sink 메커니즘 |

**설계 철학**:
1. **Web2 사용자는 토큰 모름**: K-Cash 포인트로만 게임 즐김 (한국 등 규제 시장 호환)
2. **Web3 사용자에게만 토큰 노출**: 지갑 연결한 옵트인 사용자만 KTNZ 인식
3. **활동 기여도 = 토큰**: 예측 적중 결과가 아니라 분석 활동이 토큰 발행 트리거 (법적 분리)
4. **건전 인플레**: 강력한 sink로 net 신규 공급률 6-10%/년 유지

---

## 1. 토큰 사양

### 1.1 기본 정보
- **Name**: KTrenZ Token
- **Symbol**: KTNZ
- **Decimals**: 18
- **Network**: Base (Ethereum L2)
- **Standard**: ERC-20 (with permit, snapshot 호환)
- **Total Supply**: 5,000,000,000 (5B) — 고정, 추가 발행 불가
- **Burn**: 가능 (sink 메커니즘으로 영구 소각)

### 1.2 컨트랙트 권한 정책
- **Owner / Admin**: DAO 멀티시그 (3-of-5)
- **Mint Authority**: ActivityMint 컨트랙트만 (whitelist), 연간 cap 강제
- **Pause Function**: 보안 사고 시 일시정지 (DAO 가결 필요, 30일 자동 해제)

---

## 2. Pre-Mint 분배 (750M / 15%)

| 용도 | 비율 | 수량 | 베스팅 | 비고 |
|---|---:|---:|---|---|
| **ICO Sale @ VBI** | 30% | 225M | TGE 25% + 6개월 선형 | 라운드별 가격 차등 (seed/private/public) |
| **Treasury / Operations** | 25% | 187.5M | 5년 분할 인출 | DAO multisig 관리 |
| **Team & Advisors** | 15% | 112.5M | **12개월 cliff + 36개월 선형** | 팀 약속의 신뢰 시그널 |
| **Initial DEX Liquidity** | 15% | 112.5M | 2년 LP 락업 (재계약) | Aerodrome / Uniswap (Base) |
| **Strategic Partners** | 10% | 75M | 6개월 cliff + 18개월 선형 | 엔터사·인플루언서·KOL 협업 |
| **Marketing & Initial Airdrop** | 5% | 37.5M | 50% TGE + 12개월 선형 | 베타 사용자 회고 에어드롭 |

**합계**: 750M ✓

### 2.1 ICO 라운드 (예시)
| 라운드 | 가격 | 할당 | 락업 |
|---|---:|---:|---|
| Seed | $0.005 | 50M | 24개월 선형 |
| Private | $0.012 | 75M | 12개월 선형 |
| Public (VBI) | $0.025 | 100M | 6개월 선형 |

> 가격은 시장 환경에 따라 조정. ICO 직전 별도 시트로 확정.

---

## 3. Activity Mining 분배 (4.25B / 85%)

### 3.1 연간 발행 스케줄 — Front-loaded Decay

| Year | 연간 발행 | 누적 | 비율 |
|:---:|---:|---:|---:|
| 1 | **1,000M** | 1,000M | 23.5% |
| 2 | 850M | 1,850M | 43.5% |
| 3 | 700M | 2,550M | 60.0% |
| 4 | 550M | 3,100M | 72.9% |
| 5 | 425M | 3,525M | 82.9% |
| 6 | 300M | 3,825M | 90.0% |
| 7 | 200M | 4,025M | 94.7% |
| 8 | 130M | 4,155M | 97.8% |
| 9 | 65M | 4,220M | 99.3% |
| 10 | 30M | **4,250M** | **100%** |

> 초기 적극적 분배 → 사용자 base 빠른 확보. 후반엔 emission ↓로 가치 보호.

### 3.2 분기 자동 조정 (Auto-Throttle)
- 분기 emission이 budget +20% 초과 → 다음 분기 action rate 20% 하향
- -20% 미달 → rate 유지, 마케팅 강화 신호
- DAO 거버넌스로 throttle factor 변경 가능 (월 1회 한도)

---

## 4. Earn Mechanics — KTNZ 발행 트리거

### 4.1 Tier 1: 일상 활동 (저액 / 고빈도)

| Action | Y1 Rate | 일일 한도 | 누적 |
|---|---:|---:|---:|
| Daily login | 1 KTNZ | 1회 | 1 |
| Trend insight 보기 | 0.2 KTNZ | 5회 | 1 |
| Content card 시청 | 0.1 KTNZ | 10회 | 1 |
| 7일 연속 스트릭 보너스 | 10 KTNZ | 주 1회 | 1.4/일 |

### 4.2 Tier 2: 예측 참여

| Action | Y1 Rate |
|---|---:|
| 예측 제출 (참여 자체) | 1 KTNZ |
| 적중 — Steady (15-30% 성장) | +2 KTNZ |
| 적중 — Rising (30-80%) | +5 KTNZ |
| 적중 — Surge (80%+) | +15 KTNZ |
| 3연속 적중 콤보 | +10 KTNZ |
| 첫 분석자 (per pair) | +1 KTNZ |

### 4.3 Tier 3: 기여 활동

| Action | Y1 Rate |
|---|---:|
| 추천 가입 + 활성 (Web3 옵트인) | 30 KTNZ |
| Trend NFT 민팅 시 creator share | 5 KTNZ |
| 큐레이션 투표 참여 | 0.5 KTNZ |
| 베타 테스트 / 버그 리포트 | 변동 (5-50 KTNZ) |

### 4.4 일일 캡 + 스테이킹 부스트

| 스테이크 상태 | 일일 캡 | 부스트 | 비고 |
|---|---:|:---:|---|
| 무스테이킹 | 30 KTNZ | 1.0x | 기본 |
| 30일 lock | 33 | 1.1x | |
| 90일 lock | 37.5 | 1.25x | |
| 180일 lock | 45 | 1.5x | |
| **365일 lock** | **60** | **2.0x** | 최대 부스트 |

> 캡 초과분은 carry-over 안 됨 (어뷰징 방지).

### 4.5 신규 사용자 보호기간
- 가입 후 첫 7일: emission 50% 감액 (sybil 농사 방지)
- 7-30일: 75%
- 30일+: 100% 정상 발행

---

## 5. Spend & Sink Mechanics — KTNZ 소비/소각

### 5.1 Battle Pass (시즌 패스) ⭐ 최대 sink

```
시즌(월간) Battle Pass: 200 KTNZ 소각

혜택:
  - 일일 분석 한도 +50% (KTNZ earn 가속)
  - 시즌 한정 NFT 에어드롭 자격
  - 시즌 리더보드 진입 자격
  - 프로필 시즌 배지 (영구)
  - 추가 이벤트 / 토너먼트 entry

번 비율: 70% burn / 30% treasury
예상 흡수량: DAU 100K × 30% × 200 × 12 = **72M/년**
```

### 5.2 Confidence Boost / Insurance (예측 옵션)

예측 제출 시 추가 옵션:

| 아이템 | 비용 | 효과 |
|---|---:|---|
| 🛡️ Loss Insurance | 30 KTNZ | 빗나가도 K-Cash 50% 환급 |
| ⚡ Confidence Boost | 50 KTNZ | 적중 시 K-Cash +20% |
| 🎯 Multi-Stake | 80 KTNZ | 같은 pair에 추가 픽 가능 |
| 🔮 Insight Unlock | 5 KTNZ | 해당 pair 프리미엄 AI 분석 |

```
번 비율: 70% burn / 30% treasury
예상 흡수량 (보수): 20% 사용률 × 평균 30 KTNZ × 매일 = 219M/년
```

### 5.3 Extra Battle Ticket — Ad vs Token (NEW)

기본 일일 티켓 소진 후 추가 참여:

| 추가 횟수 | Web2 사용자 | Web3 사용자 |
|:---:|---|---|
| 1번째 | 광고 30초 시청 → +1 | 광고 시청 OR **30 KTNZ 소각** |
| 2번째 | 광고 시청 (광고 캡 진입) | 광고 시청 OR **50 KTNZ 소각** |
| 3번째 | 광고 시청 (광고 캡 = 3장) | 광고 시청 OR **80 KTNZ 소각** |
| 4-5번째 | ❌ (다음날까지 대기) | **120 KTNZ 소각** (점증) |
| 6번째+ | ❌ | **점증 ×1.5** (이후 동일) |

**Web3 사용자가 토큰 사용 시 인센티브**:
- 해당 예측에 한해 **K-Cash 적립률 +10%**
- 광고 cooldown 우회 (즉시 가능)
- 시즌 누적 토큰 사용량 → 시즌 배지 + 리더보드 가산

```
번 비율: 80% burn / 20% treasury (광고 수익은 별도)
예상 흡수량 (DAU 100K, 25%가 토큰 사용 옵션): 120-180M/년
```

### 5.4 Trend NFT (수집형)

이긴 예측을 NFT로 영구 보존:

```
민팅 비용: 100 KTNZ (기본)
한정: 같은 pair에서 적중자 상위 10명만 민팅 가능
재판매 로열티: 5% (50% 소각, 50% creator 분배)

번 비율: 100% burn (민팅 비용)
```

### 5.5 Premium / Cosmetic Sinks

| 항목 | 비용 |
|---|---:|
| 프로필 프레임 (영구) | 50-300 KTNZ |
| 시즌 한정 아바타 | 100-500 KTNZ |
| 배틀 priority boost (앞에 노출) | 20 KTNZ/회 |
| 새 K-Star 추천 투표 | 10 KTNZ/표 |

```
번 비율: 70% burn / 30% treasury
```

### 5.6 External Redemption (외부 보상 store)

| 항목 | 비용 (KTNZ) |
|---|---:|
| Spotify Premium 1개월 | 5,000 |
| K-pop 앨범 (실물) | 3,000-8,000 |
| 콘서트 티켓 응모권 | 2,000 |
| 굿즈 (한정) | 변동 |

```
번 비율: 100% Treasury (외부 결제 fiat 운영비)
```

### 5.7 Buy-back & Burn (재단 차원 디플레이션)

```
정책:
  분기마다 트레저리 수익의 30%를 시장에서 KTNZ 매수 → 영구 소각
  
가격 floor 효과:
  - 가격 하락 시 자동 매수 압력
  - 신뢰 시그널 (재단의 long-term commitment)
  
운영:
  분기 buyback 액수는 DAO 분기 보고서에 공시
  매수는 TWAP (시간 가중 평균) 알고리즘으로 분산 집행
```

### 5.8 Stake-Gated Premium (락업형 sink)

KTNZ를 "쓰는" 게 아닌 "묶는" 형태 — 순환 공급 차감:

| Tier | 락업 KTNZ | 락업 기간 | 추가 혜택 |
|---|---:|:---:|---|
| Pro Analyst | 1,000 | 365일 | 무제한 AI 인사이트, 전용 분석 도구 |
| Curator | 500 | 90일 | 새 K-Star 추천 권한, 큐레이션 패널 |
| VIP | 200 | 30일 | 시즌 NFT 우선 민팅 |

```
스테이크 자체는 burn 아님 → 추후 unstake 가능
하지만 락업 기간 동안 매도 압력 ↓ + 가격 안정 효과
```

---

## 6. Staking 구조

### 6.1 Lock 옵션 (KTNZ stake)

| Lock | K-Cash earn 부스트 | 거버넌스 가중 | 추가 혜택 |
|---|:---:|:---:|---|
| Flexible | 1.0x | 0.05x | — |
| 30일 | 1.1x | 0.15x | VIP tier 자격 |
| 90일 | 1.25x | 0.5x | Curator tier 자격, NFT pre-mint |
| 180일 | 1.5x | 0.85x | 무제한 인사이트 |
| **365일** | **2.0x** | **1.0x** | Pro Analyst tier, 시즌 NFT 자격 |

### 6.2 Reward Distribution
- 스테이킹 보상: K-Cash 부스트 (KTNZ 추가 emission 아님 → 인플레 압력 없음)
- 거버넌스 보상: 분기마다 보상 풀 (트레저리에서 추첨)
- 14일 락: 보상으로 받은 KTNZ는 14일 후 재스테이킹 가능 (어뷰징 방지)

### 6.3 Slashing (없음)
- 일반 스테이킹은 slashing 없음
- 거버넌스 악의적 투표는 별도 컨트랙트로 신고/감사 (slashing 미적용)

---

## 7. 거버넌스

### 7.1 의사결정 카테고리

| 카테고리 | 결정권 | 빈도 |
|---|---|---|
| Action rate 조정 | DAO 투표 (월 1회 한도) | 분기 |
| 새 K-Star 추가 | Curator + 토큰 홀더 투표 | 시즌 (월) |
| 시즌 이벤트 / 보상 풀 | DAO 투표 | 시즌 |
| Treasury 사용 (>10% allocation) | DAO 투표 | 임시 |
| Treasury 사용 (<10%) | Multisig 단독 | 상시 |
| 컨트랙트 업그레이드 | DAO 투표 + timelock 14일 | 임시 |
| Emergency pause | Multisig (3-of-5) | 즉시, 30일 자동 해제 |

### 7.2 투표 메커니즘 (Phased)

**Phase 3 시작**: Snapshot.org (off-chain 투표, 가스 무비용)
- 투표 가중치: stake × duration weight
- 정족수: 총 stake KTNZ의 5%
- 통과: 단순 과반

**Phase 4**: On-chain governor (Compound-style)
- Timelock 14일 (보안)
- Veto 권한 (founder 멀티시그, 1년 후 소멸)

### 7.3 초기 DAO 멀티시그
- 5명 (창업자 2 + 외부 advisor 3)
- 3-of-5 서명
- 1년 후 DAO 거버넌스 비중 점진 확대

---

## 8. 지역(Geo) 컴플라이언스 전략

### 8.1 듀얼 트랙 모델

```
🌍 Web2 트랙 (모든 지역, 한국 포함)
   - K-Cash 포인트 (오프체인 게임머니)
   - Battle, 예측, 추가 광고 시청
   - 환금성 게임머니 아님 (외부 거래/환전 차단)

🌐 Web3 트랙 (특정 지역만)
   - 지갑 연결 (RainbowKit / Privy)
   - KTNZ 클레임, 스테이킹, NFT, 거버넌스
   - DEX 거래, 외부 wallet으로 출금
```

### 8.2 지역별 활성화 매트릭스

| 국가/지역 | Web2 게임 | 지갑 연결 | KTNZ Claim | NFT | 비고 |
|---|:---:|:---:|:---:|:---:|---|
| 🇰🇷 한국 | ✅ | ❌ | ❌ | ❌ | 게임산업진흥법 우회 |
| 🇨🇳 중국 | ✅ | ❌ | ❌ | ❌ | crypto 전면 금지 |
| 🇺🇸 미국 | ✅ | ❌ | ❌ | ❌ | SEC + state별 검토 후 활성 |
| 🇸🇬 싱가포르 | ✅ | ⚠️ | ⚠️ | ⚠️ | MAS 게이팅 (KYC 필요) |
| 🇯🇵 일본 | ✅ | ✅ | ✅ | ⚠️ | FSA 등록 후 NFT 활성 |
| 🇪🇺 EU | ✅ | ✅ | ✅ | ✅ | MiCA 준수 (Phase 4) |
| 그 외 | ✅ | ✅ | ✅ | ✅ | |

### 8.3 차단 메커니즘 (Defense-in-depth)

1. **Layer 1 — IP 차단**: Cloudflare `cf-ipcountry` 헤더로 Web3 UI 미노출
2. **Layer 2 — 약관 동의**: 지갑 연결 시 "거주국 제한 미해당" 체크박스
3. **Layer 3 — KYC**: KTNZ 클레임 시 별도 KYC (Sumsub/Persona), 한국·중국·미국 거주자 차단
4. **Layer 4 — 컨트랙트 화이트리스트**: claim 컨트랙트가 KYC 통과 지갑만 허용 (Merkle root 정책)

> Layer 1만으로는 VPN 우회 가능. Layer 4까지가 법적 "good faith" 입증.

### 8.4 KYC 정책
- VBI ICO 구매자: VBI에서 KYC 완료
- 활동 마이닝 클레임: 첫 클레임 전 KYC (10 KTNZ 미만은 면제 가능)
- 외부 redemption: 누적 $1000 USD 상당 이상 시 KYC 의무

---

## 9. 지속가능성 모델

### 9.1 Y1 시뮬레이션 (DAU 100K 가정)

```
INCOMING (KTNZ 발행):
─────────────────────
Daily activity 평균 8 KTNZ × 100K × 365 = 292M
보너스 / 추천 등                          = 50M
─────────────────────
Total Y1 Emission                        = 342M (예산 1B의 34%)

OUTGOING (KTNZ 소각):
─────────────────────
Battle Pass (30% × 200 × 12)         = 72M
Insurance/Boost (20% × 30 × 365)     = 219M
Extra Ticket Token (25% × 50 × 30%일) = 137M
Trend NFT (5K × 100)                 = 0.5M
Cosmetics                            = 5M
External Redemption                  = 25M
Buy-back (treasury 30% × 추정)        = 10M
─────────────────────
Total Y1 Sinks                       = 468M

순 흐름:
─────────
Total burn (60% of sinks 보수): 281M
Total treasury (40%):           187M
─────────
Net 신규 공급 = 342M emission - 281M burn = 61M
연 인플레: 61M / pre-mint 750M = 8.1%
```

### 9.2 인플레 목표

| Year | Net 인플레 목표 |
|:---:|---:|
| Y1 | 8-12% (성장 단계) |
| Y2-3 | 5-10% |
| Y4-5 | 3-7% |
| Y6+ | 0-5% (성숙 단계) |
| Y10+ | 디플레이션 가능 |

### 9.3 Sink/Source 비율 목표

```
Y1 목표: Sink ≥ 35% of Source
Y3 목표: Sink ≥ 60% of Source
Y5 목표: Sink ≥ 85% of Source
Y8+ 목표: Sink ≈ Source (균형) 또는 Sink > Source (디플레이션)
```

---

## 10. 어뷰징 방지 (Anti-Sybil)

### 10.1 위협 모델

| 위협 | 위험 수준 | 방어 |
|---|:---:|---|
| 봇 다중 계정 농사 | 🔴 High | 일일 캡, 신규 보호기간, KYC, IP+device fingerprint |
| 무작위 픽 농사 | 🟡 Mid | "탐색 게이트" (현 구현), 적중률 가중 |
| Sybil 거버넌스 조작 | 🟡 Mid | Stake-weight, duration multiplier |
| 추천 자기 가입 | 🟡 Mid | 추천인 KYC 또는 wallet age >30일 |
| Pump & Dump | 🔴 High | Vesting (4y team, 6mo ICO), DAO 매도 한도 |
| 외부 결과 변조 | 🟡 Mid | Onchain anchor (settlement hash), 다중 oracle |

### 10.2 품질 가중 (Quality Score)

활동 점수 산정 시 **품질 가중** 적용:

```
Quality Score = base_activity_score × quality_factor

quality_factor:
  - 분석 완료 (트렌드 + 콘텐츠 2) → 1.0x
  - 단순 클릭만 → 0.3x
  - 적중률 > 50% (장기) → +0.2x 보너스
  - 적중률 < 25% (장기) → -0.2x 페널티
  - 시즌 활동 일수 > 80% → +0.1x
```

### 10.3 신규 지갑 보호

```
Wallet Age × Reward Multiplier:
  0-7일:    0.5x (sybil 위험 최고)
  8-30일:   0.75x
  30-90일:  0.9x
  90일+:    1.0x
```

### 10.4 디바이스/IP 추적
- 같은 device fingerprint에서 N개 이상 지갑 → 모두 0.5x 페널티 (cluster sybil)
- 같은 IP에서 N개 이상 활성 계정 → 동일 페널티
- 캡 누적: 디바이스 단위로도 일일 캡 적용

---

## 11. 단계적 출시 (Phased Rollout)

### Phase 0 — 현재 상태 (2026-04)
- ✅ Web2 게임 정상 운영 (오프체인 K-Cash)
- ✅ KTNZ 750M pre-mint 보유 (트레저리)
- ✅ Battle 메커닉 / 분석 게이팅 / 등급제 완성

### Phase 1 — Web3 인프라 (2-3개월)
**Goal**: 지갑 연결 인프라 + 사용자 행동 데이터 수집

- [ ] `profile.wallet_address` 컬럼 추가 (마이그레이션)
- [ ] Settings에 RainbowKit/Privy 지갑 연결 UI
- [ ] Region detection (cf-ipcountry)
- [ ] Web3 옵트인 사용자 활동 추적 (참여 점수 계산 백엔드)
- [ ] **Onchain 발행 없음** — 데이터만 수집
- [ ] **KYC 모듈 통합** (Sumsub/Persona)

### Phase 2 — VBI ICO + Activity Mining 시작 (4-6개월)
**Goal**: 토큰 라이브, 활동 보상 분배 시작

- [ ] VBI ICO 라운드 진행 (225M sale)
- [ ] DEX (Aerodrome / Uniswap on Base) 초기 LP 제공 (112.5M)
- [ ] Merkle Distributor 컨트랙트 배포
- [ ] 백엔드 weekly snapshot job → Merkle root 게시
- [ ] 사용자 self-claim UI ("이번 주 클레임: N KTNZ")
- [ ] **Battle Pass + Insurance/Boost 동시 출시** (sink 즉시 활성)
- [ ] Y1 emission 시작 (auto-throttle 가동)

### Phase 3 — 거버넌스 + NFT (6-12개월)
**Goal**: 토큰 유틸 확장, 디플레이션 압력 강화

- [ ] Staking contract 배포 (lock + boost)
- [ ] Trend NFT collection (Base on-chain mint)
- [ ] Profile cosmetics 마켓
- [ ] Snapshot 거버넌스 활성화
- [ ] Stake-gated tier (Pro Analyst, Curator, VIP)
- [ ] External redemption store (Spotify Premium 등)
- [ ] **Buy-back & Burn 시작** (분기 보고서 공시)

### Phase 4 — DAO + IP 협업 (12-24개월)
**Goal**: 분권화 완료, 엔터사 협업

- [ ] On-chain governor 마이그레이션 (Compound-style)
- [ ] DAO 트레저리 multisig → DAO 투표로 이양
- [ ] Star Fan Token 또는 IP NFT (엔터사 라이선스 후)
- [ ] EU MiCA / 일본 FSA 컴플라이언스 (해당 시장 활성)

### Phase 5 — 글로벌 확장 (24개월+)
- [ ] 다국어 사용자층 확대
- [ ] 지역별 파트너십 (각국 K-pop 팬덤)
- [ ] L2 cross-chain bridge (필요 시)

---

## 12. 리스크 분석

### 12.1 규제 리스크

| 리스크 | 영향 | 완화 |
|---|---|---|
| 한국 게임산업진흥법 위반 | 🔴 Critical | Web2/Web3 분리, 한국 IP는 Web3 미노출 |
| 미국 SEC howey test | 🔴 Critical | 미국 IP 차단, ICO에서 미국인 미참여 |
| EU MiCA 준수 | 🟡 Mid | Phase 4에서 등록 후 활성 |
| 일본 FSA 가상자산 등록 | 🟡 Mid | Phase 3 후반 등록 진행 |
| 환경/AML | 🟡 Mid | KYC + transaction monitoring (Chainalysis) |

### 12.2 시장 리스크

| 리스크 | 영향 | 완화 |
|---|---|---|
| ICO 후 즉시 매도 압력 | 🟡 Mid | Vesting, 점진적 release |
| Bear market 지속 | 🟡 Mid | Buy-back & Burn, sink 강화 |
| 사용자 ↑ 시 emission 부족 | 🟢 Low | Auto-throttle로 자동 조정 |
| 사용자 ↓ 시 emission 과잉 | 🟡 Mid | DAO 거버넌스로 rate 하향 가능 |

### 12.3 기술 리스크

| 리스크 | 영향 | 완화 |
|---|---|---|
| 컨트랙트 취약점 | 🔴 Critical | Audit (CertiK, OpenZeppelin), bug bounty |
| Oracle 변조 | 🟡 Mid | 다중 oracle, settlement hash anchor |
| Base L2 장애 | 🟡 Mid | Pause function, off-chain fallback |
| 백엔드 snapshot 변조 | 🟡 Mid | Merkle proof 검증, 분산 노드 |

### 12.4 거버넌스 리스크

| 리스크 | 영향 | 완화 |
|---|---|---|
| Whale 단독 지배 | 🟡 Mid | 1지갑 1투표 cap (총 stake의 5%) |
| 투표 무관심 | 🟡 Mid | 투표 인센티브 (KTNZ 보상) |
| 악의적 제안 통과 | 🟡 Mid | Timelock 14일, founder veto (1년) |

---

## 13. 미결정 사안 / 향후 결정 항목

다음 항목은 ICO 또는 Phase 진입 전 별도 확정 필요:

1. **VBI 라운드별 가격** — seed/private/public 정확한 가격 및 quota
2. **KYC 제공자** — Sumsub vs Persona vs 자체 솔루션
3. **NFT 컬렉션 디자인** — Trend NFT 시각적 정체성, 한정 정책
4. **Buy-back 알고리즘** — TWAP 윈도우, slippage 정책
5. **Star Fan Token** — Phase 4에서 어느 스타부터 시작할지
6. **법적 자문사** — 한국 / 미국 / EU 별 자문 firm 확정
7. **거버넌스 첫 안건** — Phase 3 진입 시 첫 의제
8. **백서 (Whitepaper)** — 본 기획서 기반 공식 백서 작성
9. **Audit 회사** — CertiK / OpenZeppelin / Trail of Bits 중 선정
10. **Marketing & PR 전략** — ICO 전 캠페인, 인플루언서

---

## 14. 변경 이력

| 버전 | 날짜 | 주요 변경 |
|---|---|---|
| v1.0 | 2026-04-27 | 초안. 5B 공급, 15/85 분배, Battle Pass + Insurance + Extra Ticket sink, Web2/Web3 듀얼 트랙 |

---

*문서 책임자: hans1329 / Claude Code 협업 작성*
*다음 검토 시점: VBI ICO 일정 확정 직전*
