# Discover Game — Mechanics 1-pager

**Codename**: Discover (working name) — replaces Battle as the global entry point.
**Premise**: A K-pop content discovery + early-call prediction game. Foreign users can play on their first session without knowing any star names. The earlier and more accurately you call which content will go viral, the more you earn.

> Battle (current) becomes "Pro Mode" — gated, KR-power-user surface. See § Coexistence.

---

## 1. Core loop (60 seconds)

1. User opens app → sees **Today's Drop**: a curated set of N content cards (MV clips, shorts, fan edits, news, performance footage).
2. For each card, user does one of three actions:
   - **Vouch** (with confidence: low / mid / high) — "this will pop"
   - **Skip** — "not this one"
   - **Tap to view** — opens content drawer (counts toward engagement, not a pick)
3. After M hours / D days, each card resolves:
   - "Viral" if its growth percentile in the cohort window crosses the threshold (see § Resolution).
4. User's vouches are scored using time-decayed, confidence-weighted points.
5. **Today's Result** screen shows: hits, misses, share card, K-Cash earned, $KTNZ mined.

---

## 2. Resolution rule (anti-degenerate, anti-dead-game)

- **Viral definition**: top P% of growth within the daily cohort over the resolution window. Default `P=30%`, window `7d`.
- **Why percentile, not absolute threshold**: absolute threshold ("hit 10M views") sounds clean but creates dead seasons (most cards fail → vouching becomes irrational → skip meta wins). Percentile guarantees a stable hit rate, keeping the game live every day.
- **Cohort = daily Drop set**, normalized by source (a TikTok short and a Spotify single can't share absolute numbers).

---

## 3. Anti-degenerate mechanics (the 4 layers)

| Layer | Rule | What it kills |
|---|---|---|
| **L1 — Vouch quota** | Must vouch on ≥30% of shown cards daily to qualify for leaderboard / token mining | Pure-skip strategy |
| **L2 — Time decay** | Early vouch (cohort hour 0–6) ×3, mid (6–24h) ×1, late (24h+) ×0.3 | "Wait and see what's already trending" copying |
| **L3 — Asymmetric reward** | Vouch + hit = +confidence×base, vouch + miss = −0.5×base, skip = 0 | Lazy participation |
| **L4 — Calibration scoring (v2)** | Brier-style scoring with confidence levels — high-confidence wrong calls hurt more than low-confidence wrong calls | "Vouch everything weakly" gaming |

**Day-1 ship**: L1 + L2 + L3. L4 lands in v2 (3 months post-launch) once we have enough data to set baselines without scaring away new users.

---

## 4. Daily ritual (DAU hook)

- **Today's Drop** drops at one fixed time globally per region cluster (e.g., 12:00 KST + 12:00 PT). Same time every day = ritual.
- Each user gets a **personal feed of N=10 cards** (algorithmic mix: 60% fresh-this-week, 30% rising-yesterday, 10% wildcards).
- Pre-resolved cards (older cohorts) appear in **History** tab — for browsing, not vouchable.
- Push notification 30min after Drop: "오늘의 후보가 떴어요. 가장 먼저 콜할 기회."

---

## 5. Share / flex artifact (viral loop, day-1 feature)

When user hits a vouch:

- Auto-generate **OG image card**: thumbnail of the content + "I called this **6 days early** — vouched at 1.2M, hit 47M views" + user handle + KTrenZ logo.
- One-tap share to X, IG Stories, TikTok, KakaoTalk.
- Each share has a referral code → new sign-up via the shared card credits the original caller (compounds on existing referral mining).

**Without this, the pivot loses 70% of its growth advantage.** This is non-negotiable for v1.

---

## 6. Reward attribution

| Mechanism | Rule |
|---|---|
| K-Cash (Web2) | Earned per scored vouch using points formula: `confidence × time_decay × hit/miss multiplier × cohort_difficulty` |
| $KTNZ mining (Web3) | Same formula, mapped to the existing Activity Mining bucket. **No tokenomics change required** — the "Activity" definition broadens from "Battle pick" to "vouch on Discover OR pick on Pro Battle" |
| Daily ad-watch bonus | Watch ad → +1 vouch slot beyond daily cap (preserves current ad revenue path) |
| Streak bonus | 7-day vouch streak = +10 K-Cash, 30-day = +50 K-Cash + cosmetic badge |

---

## 7. UI flow (rough wireframe)

```
HOME (Discover tab — default)
├── [Today's Drop] header — countdown to resolution
├── Card stack (swipeable, TikTok-style vertical)
│   ├── Thumbnail / clip preview (auto-play muted)
│   ├── Source icon + stat badges (current views, age)
│   ├── Vouch buttons: [Low] [Mid] [High]  /  [Skip] (always visible at bottom)
│   └── Tap thumbnail → drawer (full content, lyrics, comments — informational)
├── Sticky bottom: "X / 10 vouched today  ·  Y in Pending"
└── [History] [Leaderboard] [Pro Battle ↗] tabs
```

---

## 8. Coexistence with current Battle (Pro Mode)

- Current Battle stays live but moves off the home tab.
- Access via `/pro-battle` URL or unlock trigger ("you've vouched 50+ correct calls" → Pro Mode unlocked notification).
- KR power users (already in Battle) auto-grandfathered in, no friction.
- KPI: % of Discover users who graduate to Pro within 90d. **If <5% by Q4 2026, deprecate Pro Mode and absorb token mining fully into Discover.**

---

## 9. PD3 / investor narrative impact

- **Tokenomics page**: `Activity Mining` definition broadens from "predict trend" to "early-call viral content + predict trend". Total mint budget unchanged.
- **B2B section**: Strengthens — "early vouch density per content" is a *more* sellable signal than "trend score", and labels/A&R are the buyer.
- **Roadmap**: Phase 0 (current Battle) becomes "Phase 0a" (KR Beta). Add "Phase 0b: Discover global launch" before Phase 1.
- **Fundraising ask**: Use of funds breakdown should explicitly call out "Discover game build + global UA" as primary Seed-stage spend.

---

## 10. Engineering scope (rough)

| Area | Scope | Estimate |
|---|---|---|
| Content viral tracking | Per-content viewthrough + share velocity, hourly snapshot, cohort percentile calc | 1.5 wk |
| Discover UI (Home tab, card stack, vouch flow) | New | 2 wk |
| Resolution + scoring engine (L1+L2+L3) | New | 1 wk |
| Share / OG image generator | New (server-rendered PNG with template) | 1 wk |
| Reward attribution + K-Cash integration | Refactor existing settlement | 0.5 wk |
| Pro Battle gating + URL move | Small | 0.5 wk |
| **Total MVP** | | **~6.5 wk** for 1 eng |

---

## 11. Phased rollout

| Phase | Window | Scope |
|---|---|---|
| **D-0**: Spec freeze | This week | Approve this 1-pager, lock resolution params (P, window, quota), pick first 100 seed contents |
| **D-1**: MVP build | Wk 1–6 | L1+L2+L3, Today's Drop, share artifact, K-Cash payout |
| **D-2**: Closed beta | Wk 7–8 | 200 invite-only users, tune percentile + time-decay coefficients |
| **D-3**: Global launch | Wk 9 | Public launch on `ktrenz.com` as default home tab. Pro Battle moves to subroute. |
| **D-4**: Calibration scoring (L4) | Wk 9 + 90d | Brier-style upgrade once data is sufficient |
| **D-5**: Pro Mode review | Wk 9 + 180d | Decide keep/deprecate based on graduation rate |

---

## Open questions (decide before D-0 freeze)

1. **Daily Drop size**: 10 cards is the initial bet. Lower = stronger signal, higher = more ad inventory. A/B in beta.
2. **Drop time**: One global time vs. region-clustered. Trade-off: ritual purity vs. timezone fairness.
3. **Confidence levels**: 3 (Low/Mid/High) vs. continuous slider. Slider has UX weight — start with 3.
4. **Skip-budget interaction with quota**: should "tap to view but don't vouch" count toward quota? Recommend NO — quota is about *committed picks*.
5. **Anti-bot**: Need rate limit + behavioral check before tokens are at stake. Use existing Supabase RLS + per-user cap.
