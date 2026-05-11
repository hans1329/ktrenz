# Discover (h1) — Product Requirements Document

**Status**: v2 (2026-05-10) — game-model pivot applied & shipped
**Owner**: Han Kim (CEO), Z (CTO)
**Codename**: h1 — internal name for the Discover pivot
**Public name**: Discover (working) — surface label "라운드" (KO) / "Round" (EN)
**1-pager precedent**: [docs/discover_game_mechanics.md](./discover_game_mechanics.md)

---

## Revision history

### v2.1 (2026-05-12) — payout doubled · UX simplification · landing for anon

UX polish session: reward labeling switched from abstract ×N multiplier to concrete K-Cash amounts (10/20/40 💎), since the game has no variable wager mechanic; ×N read as "stake size" and was misleading. Misc copy and visual cleanup.

| Area | v2 | v2.1 |
|---|---|---|
| Hit payout per tier | floor(weight × 10) = 5 / 10 / 20 💎 | **floor(weight × 20) = 10 / 20 / 40 💎** |
| Miss penalty per tier | 2 / 5 / 10 💎 | **5 / 10 / 20 💎** (proportional bump) |
| Vouch button label | `×1 / ×2 / ×4` + Sprout/Activity/Rocket icon | **`+10💎 / +20💎 / +40💎`**, no icons; tier-tinted backgrounds match Call Strength chips |
| Confirm dialog title | "Call this ×N?" + tier icon | **"적중시 +N 💎"** ("Hit it · +N 💎"); icon removed; "오늘의 라운드 (1 of 24)" line removed |
| Confirm dialog slots strip | per-tier shows `×N` | per-tier shows `+N💎` (hit amount keyed) |
| Post-vouch card | separate "called ×N" box at bottom + small +N buttons | top chip shows just `✓ CALLED`; vouch row shows the SAME 3 buttons with the selected tier in active state (no separate box) |
| Quota target | fixed `7` (hardcoded) | scales to cohort size: `floor(cohortSize × 7 / 24)`. 24-card cohort → 7; 12-card → 3 |
| Per-artist cap | 2 / day | **1 / day** (highest-scoring representative wins; "same artist twice" eliminated) |
| Curate cross-day dedup | none | items used in any drop within last 7d are excluded from new curation |
| Curate existing-row dedup | only new candidates compared | seeds dedup sets with rows already in today's drop (vouch-protected survivors) so fillers don't dup them |
| Curate fingerprints | thumbnail (host+path) | + filename fingerprint (catches same image on different CDN hosts); cross-artist title Jaccard (Dino vs Seventeen "피철인" case) |
| Slot consumption on tier change | implicit | **Same-day tier swap on same card consumes no new slot** (UPSERT on (user_id, drop_id), `vouched_at = now()` just shifts which tier's bucket the row belongs to). **D+1 change moves the row into the new day's slot count.** |
| Ad unlock daily cap | 2 | **5** (server cap); client further gates by `min(serverRemaining, cards.length - vouchedCount)` so cohorts smaller than the cap don't strand unused ad watches |
| Logged-out experience | full discover feed visible to anon | **dedicated landing**: hero + sample card (real DesktopCard, opens DetailDrawer) + 3-step + Call Strength + 5-source strip + stats + K-Cash uses + more picks grid + Pro Mode teaser + 8-question accordion FAQ + CTA "지금 가입시 1,000 💎 즉시 지급" |
| Landing localization | n/a | full i18n (50 keys) across en/ko/ja/zh |
| Anon vouching | localStorage write that gets replayed to server on first login | **removed** — anon clicks open login nudge instead. Eliminates cross-account leak via shared `ktrenz-h1-vouches-{date}` key (now keyed by `ktrenz-h1-vouches-{userId-or-anon}-{date}` with owner ref to prevent stale-data race on auth flip) |
| Card prompt copy | "Top 7 of today's 24 in 7 days?" + "More confidence, bigger reward" | "7일 후 상위 30% 진입 예측" + "적중하면 최대 4배 보상" — same string for full + short variants |
| Quota current digit color | white | **violet-500** (highlights how far user is along) |
| Header nav redundancy | tabs always shown md+ even when sidebar present at lg+ | tabs shown **only md range** (`hidden md:flex lg:hidden`); lg+ uses sidebar alone |
| Header height | 48 px | **56 px**; logo / tabs / balance chip all bumped one tailwind step |
| Landing CTA | "Sign in to start" | "지금 가입시 1,000 💎 즉시 지급" — surfaces the welcome bonus value directly |
| Buzz now metric on detail | shown as `engagement_score` (per-artist run total for legacy items) | unified label "Buzz"; engagement_score now per-item via `metadata.{views,plays,likes,ups}` from content-search; YouTube `videos.list` enrichment added for per-video viewCount |
| Detail drawer stats | Buzz · Posted (2-col) | Buzz · Rank (`#N / cohortSize`, client-sorted) · Velocity (`views/hour`) · Posted (2×2 grid) |
| IG modal load time | DB cache 25 min + sequential prefetch | DB cache **4 h** + parallel prefetch with `<link rel="preload">` priming for first 3 images; SW CacheFirst registered for `cdninstagram.com`/`fbcdn.net` (6 h) |
| PWA refresh button | `updateServiceWorker(true)` (didn't actually reload — `controllerchange` not firing under autoUpdate+clientsClaim) | explicit `window.location.reload()` after SW update |
| Daily drop fallback | strict `drop_date = current_date` (broken when cron late or DELETE+regen partial) | RPC picks **latest unresolved drop** for the region; clients see content even mid-cron or after manual regen |
| time_decay legacy copy | "Earlier calls earn more / 늦게 바꾸면 적게 받습니다" remnants | sweeped from all locales, SEO description, shared slate, help modal — explicit "변경 시점 페널티 없음" stated |
| Cron timing | daily 00:15 UTC = 09:15 KST | **unchanged** — user opted to keep 15-min content lag rather than move cron (quota resets at UTC 00:00 = KST 09:00; content arrives 15 min later) |
| CI/CD | manual `npx wrangler pages deploy` | automated: `.github/workflows/ci.yml` deploys dist on main push (CLOUDFLARE_API_TOKEN + ACCOUNT_ID secrets) |
| K-Pass copy on landing | n/a | inline mentions ×2 slots, 30-day trend insights, Pro Studio API as redemption use cases |

Migrations applied (in order this session):
1. `20260511120000_h1_ad_unlocks.sql` — base ad unlock table + RPCs (cap=2)
2. `20260511140000_h1_ad_unlock_cap_5.sql` — cap 2→5 + `my_status` reflects new cap
3. `20260511150000_b2_items_engagement_backfill.sql` — backfill per-item engagement from metadata
4. `20260511160000_h1_get_latest_active_drop.sql` — RPC returns most recent unresolved drop instead of strict `current_date`

### v2 (2026-05-10) — snap-judgment + multi-round editing
Operating philosophy reframed: trend prediction is snap judgment, not observation. Time-decay early-bird bonus removed. Users now edit picks any day until resolution. Round terminology adopted (KO).

| Area | v1 | v2 |
|---|---|---|
| Drop size | N = 10 | **N = 24** (matches client `DROP_SIZE` constant) |
| Quota | 30% of 10 = 3 | 30% of 24 = 7 (= daily slot cap) |
| Confidence display | "Low/Mid/High" | **×1 / ×2 / ×4** (multiplier as primary chrome; Hunch/Pick/Lock as Help-only labels) |
| Slot caps | none | **×1: 1/day · ×2: 4/day · ×4: 2/day** (7 actions/day total) |
| Time decay | ×3.0 (h0-24), ×1.0 (24-72), ×0.3 (72-168) | **removed** — all bets paid the same regardless of timing |
| Editing window | Day-1 only (effective implementation bug) | **Editable any day until resolution**, across all open rounds |
| Mid/×2, High/×4 prerequisite | none | requires K-Cash balance > 0 (×1 always free) |
| Daily drip | none | **+10 K-Cash/day** if user voucher activity yesterday |
| Welcome stake | none (H1) | **1000 K-Cash** from Battle welcome bonus (shared wallet) |
| Wallet | per-vouch K-Cash row only, never aggregated | resolves write to `ktrenz_point_transactions` ledger; balance auto-floors at 0 |
| Off-topic filter | none | scraper-side hashtag deny-list + 4-layer cohort dedup at curate (thumb fingerprint, star+date, Jaccard ≥ 0.3, per-artist cap 2) |
| Confirm dialog | n/a | new — preview win/miss K-Cash + slot impact + resolution date before commit |

### v1 (2026-05-08) — initial PRD
See sections below; semantics still authoritative where v2 didn't supersede.

---

## 1. Why this exists

KTrenZ's current product (Battle) gates global growth on three friction points:

1. **Bilateral matchups assume star recognition.** Foreign users without K-pop literacy can't pick A vs B if they recognize neither.
2. **Trend-score prediction is analytical, not emotional.** Discovery-mode users want to *encounter* artists, not predict their growth.
3. **Content is treated as evidence for star prediction**, one layer of indirection from how global K-pop fandom actually behaves — content (clips, fancams, MVs) goes viral first; the artist gets discovered through the content.

**Discover (h1) inverts this.** Content is the unit of play. Users vouch on individual contents — "this will pop" — and earn for being early and accurate. The game doubles as a discovery surface: every card is also exposure to a new artist.

---

## 2. Goals & non-goals

### Goals
- **G1**. Become the global entry point for KTrenZ. Default home tab on `ktrenz.com` once validated.
- **G2**. Onboard a foreign user from cold to first vouch in **under 30 seconds** without prior K-pop knowledge.
- **G3**. Generate a defensible **"early viral signal" data product** for B2B (labels, A&R, brands).
- **G4**. Establish a viral loop via shareable "I called this X days early" artifacts.
- **G5**. Preserve and extend the existing $KTNZ activity-mining tokenomics (no token redesign).

### Non-goals (v1)
- Replacing Battle entirely. Battle becomes "Pro Mode," accessible to power users.
- Building a recommendation engine. Today's Drop is a curated daily set; personalization is v2.
- Live video playback inside the app. We deep-link to source platforms.
- Social features beyond share — no comments, no follows, no DMs.
- Continuous (slider) confidence — locked to 3 discrete tiers (×1/×2/×4).
- ~~Multi-day prediction markets~~ — superseded in v2: rounds remain editable across the 7-day resolution window, multiple rounds open concurrently.

---

## 3. Personas

| Persona | Where they live | Primary motivation | What they do on Discover |
|---|---|---|---|
| **Curious Foreign Fan** ("Maya, 21, US college") | TikTok For You | Find the next thing | Swipe through Today's Drop, vouch on cards that "feel right" |
| **Existing K-pop Fan** ("Hye-jin, 27, KR") | Twitter K-pop community | Be ahead of the curve | High-confidence vouches on emerging acts; share calls to flex |
| **Early-Curve Tastemaker** ("Sam, 30, music critic / blogger") | Spotify Discover Weekly | Reputation, calibration | Builds streak, climbs leaderboard, exports calls externally |
| **Industry Buyer** (B2B, not direct user) | Internal dashboards | Predictive market signal | Buys aggregate "early-vouch density per content" via API |

---

## 4. Core gameplay loop

### Daily flow (60 sec target)

1. User opens `/h1` (or `ktrenz.com` once promoted to default).
2. **Today's Round** is a curated set of N=**24** contents released at one fixed time per region cluster.
3. For each card the user can:
   - **Vouch (Low / Mid / High)** — confidence-tiered prediction "this will go viral"
   - **Pass** — implicit, by scrolling/swiping past without vouching
   - **Tap to view detail** — opens drawer with stats + source link (does NOT count toward vouch)
4. Vouches lock at resolution time (default: 7-day window).
5. After resolution, scoring rewards **early + correct + appropriately-confident** vouches.
6. Daily summary screen shows hits, misses, share artifact, K-Cash earned, $KTNZ minted.

### Key UX rules
- **Scroll = pass.** No explicit Skip button. Passing is free, has no negative score.
- **Vouching is committal.** Once vouched at confidence X, cannot un-vouch (can only adjust confidence within the resolution window).
- **Detail drawer is engagement-only.** Doesn't satisfy quota — only an actual vouch does.

---

## 5. Game mechanics — the 4 anti-degenerate layers

The biggest design risk is **degenerate strategies that produce no signal**: skip-only, only-vouch-the-already-viral, vouch-everything-at-low-confidence. Four layered rules guard against each:

### L1 — Daily vouch quota
- User must vouch on **≥30% of shown cards** (default: 7 of 24) to qualify for that day's leaderboard and token mining.
- Below quota: vouches still recorded for personal stats, but no leaderboard/mining credit.
- **Kills**: pure-skip strategy.

### L2 — Daily slot caps **(v2 — replaces former Time Decay)**
- Per-tier daily caps: **×1 = 1/day · ×2 = 4/day · ×4 = 2/day** (= 7 total actions/day).
- A "slot" is consumed by any vouch action with `vouched_at >= today_midnight` (creating or modifying), counted across all open rounds.
- ×2 / ×4 additionally require K-Cash balance > 0 (×1 is always free, so a broke user can climb back).
- **Kills**: "always pick ×4" dominant-strategy degeneracy — high tier is scarce.
- **Why time-decay was removed**: trend prediction is snap-judgment, not observation. Earlier-vouch reward bonus didn't fit the mental model and effectively never fired (record_vouch was scoped to `current_date` only, so all bets coincidentally got the day-1 multiplier).

### L3 — Asymmetric reward
- `final_score = confidence_weight × outcome_mult` where `outcome_mult = +1.0 (hit)` / `−0.5 (miss)`.
- `k_cash = floor(final_score × 10)` — can be negative; the wallet trigger floors balance at 0 so a broke user never goes negative.
- **Pass (scroll past)**: 0.
- Hit and miss values per tier (decay no longer applies):

  | Tier | weight | hit K-Cash | miss K-Cash |
  |---|---|---|---|
  | ×1 (Hunch) | 0.5 | +5  | −2 |
  | ×2 (Pick)  | 1.0 | +10 | −5 |
  | ×4 (Lock)  | 2.0 | +20 | −10 |

- **Kills**: lazy-vouch-everything strategy.

### L4 — Calibration scoring (v3 — ship +90d)
- Brier-style scoring: `score = 1 − (predicted_prob − actual)²` weighted by confidence.
- High-confidence wrong calls hurt more than low-confidence wrong calls.
- High-confidence right calls earn more than low-confidence right calls.
- **Kills**: "vouch everything weakly" gaming.
- **Why deferred**: needs ~90 days of data to set confidence-calibration baselines without scaring new users.

### Confidence weights (v2 — displayed multiplier 1/2/4)
Internal weight × hit_mult / miss_mult, surfaced to the user as ×1, ×2, ×4 multiplier badges. The button labels (Hunch / Pick / Lock — Korean: 감 / 추천 / 강추) are kept in the Help modal only.

| Display | Internal weight | Slot cap/day | Balance gate |
|---|---|---|---|
| ×1 | 0.5 | 1 | none (free) |
| ×2 | 1.0 | 4 | balance > 0 |
| ×4 | 2.0 | 2 | balance > 0 |

---

## 6. Resolution rules

### What counts as "viral"
- **Percentile-based, not absolute threshold.**
- A content is "viral" if its growth (delta in views/engagement over the resolution window) ranks in the **top P%** of its daily cohort.
- Default `P = 30%`, `window = 7 days`.

### Why percentile (not absolute "1M views")
- Absolute thresholds create dead seasons: most cards fail → vouching becomes irrational → skip meta dominates.
- Percentile guarantees a **stable hit rate** so the game feels alive every day.
- Cohort scoping: same daily Drop set, normalized per source (a TikTok short and a Spotify single can't share absolute view counts).

### Resolution data sources (v1)
| Source | Metric tracked | Provider |
|---|---|---|
| YouTube | view_count delta over 7d | YouTube Data API |
| TikTok  | view_count delta over 7d | TikTok Display API (where available) |
| Spotify | stream_count delta over 7d | Spotify for Artists scrape (interim) |
| News    | engagement_score delta in our pipeline | KTrenZ ingestion |

### Resolution job
- Cron job runs daily 00:30 UTC.
- For each card past resolution window: compute final delta, percentile-rank within cohort, mark hit/miss.
- Score user vouches per L1–L3 formulas.
- Materialize daily leaderboard.

---

## 7. Daily ritual

### Today's Round
- One curated set of **N=24 contents** per region cluster, dropped at **fixed time daily**.
- Drop time (TBD pre-launch — see Open Questions): single global time vs. regional staggering.
- Mix: 60% fresh-this-week · 30% rising-yesterday · 10% wildcards (rookies / B-side picks).

### Curation algorithm v2 (server-side)
- Pull recent content items from `ktrenz_b2_items` (last 72h, has_thumbnail, not naver_blog).
- Rank by blended score: `0.7 × normalized_engagement + 0.3 × freshness_factor`.
- **Off-topic hashtag deny-list** — drops items tagged with #jdm/#drift/#gaming/etc. (cars, gaming, gambling, sports leagues). Same list also enforced at scraper save time so bad data never enters `ktrenz_b2_items`.
- **4-layer cross-source dedup** — walks scored items high→low, drops any that match an already-picked item via:
  1. Same thumbnail fingerprint (host + path) — same press photo from CDN
  2. Same `star_id` + same `published_at::date` — same news cycle
  3. Title-token Jaccard ≥ 0.3 within same star — same event, different outlets
  4. Per-artist cap (`PER_ARTIST_CAP = 2`) — variety
- **Cohort cap** — both `record_vouch` lazy-create and curate-drop respect a hard 24-row ceiling per `(drop_date, region)` so the slate never inflates past 24.
- Store as `ktrenz_h1_daily_drop` row keyed by date+region.

### Personalization (v2)
- Personal feed weighted by user's vouch history (preferred artists, sources).
- Cold-start: purely curated (same as v1).

### Push / re-engagement
- Push notification 30 min after Drop: "오늘의 후보가 떴어요. 가장 먼저 콜할 기회."
- Reminder push at T-2h before resolution if user hasn't met quota.

---

## 8. Share / viral artifact

**Critical for growth.** Without a shareable flex, Discover loses 70% of its viral upside.

### When generated
- Per individual successful vouch (auto-generated post-resolution).
- Per daily summary ("here are my X calls today").

### Format
- **Server-rendered PNG** via Edge Function (Cloudflare Workers + canvas/Satori).
- Templates:
  - **"Early call" card** — content thumbnail + "I called this **6 days early** — vouched at 1.2M, hit 47M views" + user handle + KTrenZ logo.
  - **"Daily slate" card** — grid of today's vouches with hit/miss outcome chips.
- Branded watermark: KTrenZ logo + tracked share URL.

### Distribution
- One-tap share to X, IG Stories, TikTok, KakaoTalk via Web Share API.
- Each share carries a referral code → new sign-up via shared card credits the original caller.
- Compounds with existing $KTNZ referral mining.

---

## 9. Reward attribution

### K-Cash (Web2, universal — v2)
- Per scored vouch: `K-Cash = floor(confidence_weight × outcome_mult × 10)` (hit/miss values per L3 table).
- Per-vouch K-Cash is also written to `ktrenz_point_transactions` ledger (reason `h1_hit` / `h1_miss`); the `trg_ktrenz_credit_points` trigger sums into `ktrenz_user_points.points`. Same wallet as Battle.
- **Daily activity drip**: +10 K-Cash if user vouched at least once yesterday (lazy-claimed on H1 page open via `ktrenz_h1_claim_drip`). No drip if inactive — anti-farming.
- **Welcome bonus**: 1000 K-Cash on first signup (existing — covers ~5 worst-case days of misses).
- **Floor at 0**: misses are clamped against current balance; user never goes negative.
- 7-day vouch streak = +10 · 30-day streak = +50 + cosmetic badge (deferred — not yet shipped).
- Watch-ad to extend daily slot caps (deferred).

### $KTNZ Activity Mining (Web3, opt-in regions)
- **No tokenomics change.** The "Activity Mining" definition broadens from "Battle pick" to "vouch on Discover OR pick on Pro Battle."
- Token mining attribution mirrors K-Cash formula but converts at the published Activity → KTNZ rate.
- Mining requires quota met AND wallet connect AND non-restricted region (existing Layer 1–4 compliance gates apply).

### Non-monetary
- Streak counter, calibration score (Brier rolling avg), public profile of best calls.

---

## 10. UI / UX

### Two distinct shells
| Viewport | Shell | Pattern |
|---|---|---|
| Mobile (<768px) | `MobileShell` | Full-screen vertical snap feed (TikTok pattern) |
| Desktop (≥768px) | `DesktopShell` | Full-width header + sidebar nav + card grid |

### Shared design tokens
- Dark canvas (`bg-neutral-950` / `bg-black`)
- Brand accent: K-TRENZ rose-orange gradient (`from-rose-500 to-orange-400`)
- Per-artist palette derived from name hash (consistent across sessions)
- Card structure: **3 sections, no gradient fades** — image plate, title block, vouch row

### Mobile shell components
- **Header (88px sticky)**: brand row + countdown/quota row + hairline progress
- **Vertical snap feed**: each card = full viewport height
  - Top 50%: image plate (thumbnail or palette fallback) + source/age chips
  - Bottom 50%: solid title block + vouch row + "Locked in · next" affordance
- **Bottom nav (68px)**: Discover · History · Ranks · Pro
- **Detail drawer**: bottom sheet with content stats + source link

### Desktop shell components
- **Header (64px sticky)**: brand on left, status chips + Pro Battle + settings on right
- **Left sidebar (256px)**: nav · today's quota card · top-callers leaderboard preview
- **Main grid**: 1/2/3 columns responsive, large cards (4:3 image + text + vouch)
- **Detail drawer**: same as mobile

### Empty / loading states
- Mobile: centered spinner; empty = "No drop available yet"
- Desktop: 6-card skeleton grid; empty = bordered prompt card

---

## 11. Information architecture

```
/h1                      → Discover home (Today's Drop)
/h1/history              → Past drops, your calls, scoreboard
/h1/leaderboard          → Daily / weekly / all-time rankings
/h1/profile/:handle      → Public profile of a caller
/h1/share/:vouchId.png   → Server-rendered share artifact (PNG endpoint)
/                        → Pro Battle (current Battle, after promotion swap)
                          (until then, /h1 is opt-in via direct URL)
```

---

## 12. Data model (Supabase / Postgres)

### New tables

```sql
-- Daily curated drop set
ktrenz_h1_daily_drop (
  id            uuid pk
  drop_date     date            not null
  region        text            not null default 'global'
  item_id       uuid            not null references ktrenz_b2_items(id)
  cohort_rank   int             not null     -- 1..10 ordering within drop
  resolution_at timestamptz     not null     -- drop_date + 7d
  resolved      bool            not null default false
  unique(drop_date, region, item_id)
)

-- User vouches
ktrenz_h1_vouches (
  id            uuid pk
  user_id       uuid            not null references auth.users(id)
  drop_id       uuid            not null references ktrenz_h1_daily_drop(id)
  confidence    text            not null check (confidence in ('low','mid','high'))
  vouched_at    timestamptz     not null default now()
  -- Resolution fields (filled by cron job after resolution_at)
  resolved      bool            not null default false
  hit           bool                                       -- null until resolved
  raw_score     numeric                                    -- before time decay
  final_score   numeric                                    -- after multipliers
  k_cash        int
  ktnz_minted   numeric
  unique(user_id, drop_id)
)

-- Resolution snapshot per item (for percentile calc)
ktrenz_h1_resolution (
  drop_id           uuid pk references ktrenz_h1_daily_drop(id)
  views_at_drop     bigint
  views_at_resolve  bigint
  growth_delta      bigint
  cohort_percentile numeric                  -- 0..1, where item ranks in cohort
  is_viral          bool                     -- percentile <= P (top P%)
  resolved_at       timestamptz
)

-- Daily leaderboard cache (materialized after resolution)
ktrenz_h1_leaderboard_daily (
  drop_date     date
  user_id       uuid
  total_score   numeric
  hits          int
  misses        int
  rank          int
  primary key (drop_date, user_id)
)
```

### Modified / reused
- `ktrenz_b2_items` — source of truth for content (no schema change)
- `ktrenz_stars` — artist info (no schema change)

### RLS policies
- `ktrenz_h1_vouches`: user can only insert/select their own; service role can update for resolution
- `ktrenz_h1_daily_drop`, `ktrenz_h1_resolution`, `ktrenz_h1_leaderboard_daily`: read by all authenticated; write by service role only

---

## 13. Backend services / APIs

### RPCs (v2 current set)
| RPC | Purpose | Caller |
|---|---|---|
| `ktrenz_h1_get_today_drop(_region text)` | Returns today's 24 cards joined with item + star info | Client (Discover home) |
| `ktrenz_h1_record_vouch(_item_id uuid, _confidence text)` | Upsert vouch on any open round (today or past, until resolution); enforces slot caps + balance gate; lazy-creates today drop row if cohort has room | Client (any vouch action) |
| `ktrenz_h1_my_today_vouches()` | User's vouches on today's drop, keyed by item_id (for hydration on login flip) | Client (Discover) |
| `ktrenz_h1_my_status()` | One-shot fetch: balance + today's slot usage per tier + drip eligibility/state | Client (status hook) |
| `ktrenz_h1_my_active_picks()` | User's vouches on non-resolved rounds, joined with current cohort rank + provisional-hit flag | Client (history / future "active picks" strip) |
| `ktrenz_h1_my_history(_limit int, _offset int)` | User's full vouch history with resolution + interim rank | Client (History tab) |
| `ktrenz_h1_claim_drip()` | Lazy daily +10 K-Cash if user voucher activity yesterday | Client (page mount) |
| `ktrenz_h1_create_shared_slate(_vouches jsonb, _handle text)` | Persists a public share slate row | Client (share flow) |
| `ktrenz_h1_slot_cap(_confidence text)` | Pure function returning the per-tier daily cap (1/4/2) | Server-side helper |

### Edge Functions
- **`h1-curate-drop`** — daily cron at 00:00 in each region's local time. Computes today's curated drop, inserts into `ktrenz_h1_daily_drop`.
- **`h1-resolve-drop`** — daily cron at 00:30 UTC. For drops past `resolution_at`, fetches latest views from sources, computes percentile, scores all vouches.
- **`h1-share-image`** — request handler at `/h1/share/:vouchId.png`. Renders PNG via Satori.

### View-count fetchers (interim)
- Existing KTrenZ ingestion pipeline already collects engagement_score periodically. For v1, `growth_delta` uses **engagement_score delta** as a proxy.
- Real view counts (YouTube Data API, TikTok Display API) wired in v1.5.

---

## 14. Engineering scope & phasing

| Phase | Window | Scope | Done? |
|---|---|---|---|
| **P0 — Scaffold** | Wk 1 | `/h1` route, mobile/desktop shells, mock data, header/sidebar/grid | ✅ |
| **P1 — Real data read** | Wk 1 | `useDiscoverCards` hook, ImagePlate with thumbnails, localStorage vouches | ✅ |
| **P2 — Backend persistence** | Wk 2 | Supabase tables, `ktrenz_h1_record_vouch` RPC, swap localStorage → server | ✅ tables + RPCs applied via Dashboard SQL Editor, frontend wired (optimistic + server persist) |
| **P-i18n — Localization broadening** | Out-of-band | ko translation rule extended to non-Korean source (was JP-only); H1 hook triggers on-demand translate for title/description | ✅ |
| **P3 — Today's Drop curation** | Wk 2 | `h1-curate-drop` Edge Function, daily cron, `ktrenz_h1_get_today_drop` RPC | ✅ edge function deployed, RPC + cron migrations applied, frontend wired (RPC-first with b2_items fallback) |
| **P4 — Resolution + scoring** | Wk 3 | `h1-resolve-drop` Edge Function, scoring formulas L1+L2+L3, K-Cash payout | ⚠️ edge function deployed, history RPC + cron migration pending Dashboard apply. v1 simplification: `views_at_drop` not snapshotted (uses absolute current engagement for percentile) |
| **P5 — Detail drawer + source link** | Wk 3 | Open source URL in new tab, optional YouTube embed for `youtube` source | ✅ (extended: TikTok player/v1 + Instagram embeds, autoplay, top-bar layout) |
| **P6a — Share artifact (URL + OG)** | Wk 4 | `ktrenz_h1_shared_slates` table + create RPC + `/h1/share/:slateId` route + Web Share API | ⚠️ migration written ([20260508150000_h1_shared_slates.sql](../supabase/migrations/20260508150000_h1_shared_slates.sql)), frontend wired, pending Dashboard apply |
| **P6b — Custom PNG image** | Wk 4 | `h1-share-image` Edge Function (Satori PNG) for OG image generation | ✅ edge function deployed (Satori → resvg-wasm pipeline, NotoSansKR + Inter fonts cached, 1200×630 output, 24h browser / 7d CDN cache). H1SharedSlate.tsx wires dynamic `og:image` via SEO prop |
| **P7 — Leaderboard + history** | Wk 4 | History tab UI, leaderboard daily/weekly, profile page | ✅ `/h1/history` (auth-gated, vouch list with hit/miss + K-Cash) and `/h1/leaderboard` (Latest day / Last 7 days toggle) shipped. BottomNav + DesktopSidebar wired to real routes; mock leaderboard preview replaced with live `ktrenz_h1_leaderboard_daily` query. Profile page deferred. |
| **P8 — Auth gating + analytics** | Wk 5 | Login wall on first vouch, event analytics, error monitoring | ⚠️ migration written ([20260508170000_h1_events.sql](../supabase/migrations/20260508170000_h1_events.sql)), frontend wired (telemetry helper, login nudge on share + quota cross, localStorage→server sync on login). Pending Dashboard apply. Hard "wall on first vouch" softened to two non-blocking nudges — full wall deferred to closed beta tuning |
| **P9 — Closed beta** | Wk 6 | 200 invite users, tune percentile P, time-decay coefficients | |
| **P10 — Public launch** | Wk 7 | Promote `/h1` to default `/`, push notification flow | |
| **P11 — Calibration scoring v2** | +90d post-launch | Brier-style scoring, calibration leaderboard | |
| **P12 — Pro Mode review** | +180d post-launch | Decide: keep Pro (Battle) or fold mining into Discover entirely | |

---

## 15. Success metrics (KPIs)

### North-star
- **D1 retention** of new sign-ups via Discover ≥ **35%** by Wk 8 post-launch
- **DAU/MAU ratio** ≥ **0.30** (sticky daily habit)

### Activation
- Cold-user time-to-first-vouch ≤ **30 sec** median
- ≥ **60%** of new sign-ups complete daily quota on D0

### Engagement
- Median vouches per DAU ≥ **5** per day
- ≥ **70%** of DAUs hit quota
- Daily share-artifact generation rate: ≥ **15%** of DAUs share at least one card

### Quality of signal (B2B value)
- Cohort hit rate (% of viral predictions that actually hit) for **top-10% leaderboard** users ≥ **45%** by Wk 12 (random baseline = 30% per the percentile config)
- This is the proxy for "is the data product worth selling"

### Tokenomics health
- $KTNZ Activity Mining attributable to Discover ≥ **40%** of daily mint by Wk 12
- Discover-driven referrals ≥ **20%** of new wallet connects by Wk 16

### Pro Mode coexistence
- Discover → Pro Battle graduation rate at 90d ≥ **5%**
- If <5%, deprecate Pro Battle per phase P12 plan

---

## 16. Coexistence with current Battle

- Battle stays live but moves off the default home tab.
- Access via `/pro-battle` URL or unlock notification ("you've vouched 50+ correct calls").
- **KR power users grandfathered**: their existing Battle access uninterrupted; they see no Discover prompt unless they opt in.
- Token mining attribution from Battle continues unchanged in v1.
- KPI gate at +180d (P12): if Discover→Pro graduation rate <5%, deprecate Pro and migrate Battle's mining attribution into Discover.

---

## 17. Launch criteria (P10 gate)

Public launch can proceed when **all** are true:

- [ ] Backend persistence is stable (P2–P4 shipped, no DB write errors > 0.1%)
- [ ] `h1-curate-drop` has run successfully for ≥7 consecutive days without manual intervention
- [ ] `h1-resolve-drop` has resolved ≥3 daily drops with correct hit/miss for 100% of vouches in QA samples
- [ ] Share artifact PNG renders correctly across X, IG, KKT (verified by manual posting)
- [ ] Closed beta cohort (P9) shows D1 retention ≥ 25% (interim target before public launch)
- [ ] Mobile and desktop shells pass accessibility audit (keyboard nav, ARIA labels, contrast)
- [ ] i18n complete for ko/en/ja/zh
- [ ] Push notification opt-in flow works on iOS Safari + Android Chrome
- [ ] PWA install prompt tested

---

## 18. Open questions (decide before P3 ships)

1. **Today's Drop size** — 10 (current bet) vs. 15 vs. 20. Larger = more ad inventory, smaller = stronger signal. A/B in beta.
2. **Drop time strategy** — single global time (e.g., 12:00 UTC) vs. regional cluster (12:00 KST + 12:00 PT + 12:00 CET). Trade-off: ritual purity vs. timezone fairness.
3. **Quota threshold** — 30% (3 of 10) vs. 50% (5 of 10). Higher = more committed user but bigger barrier.
4. **Confidence levels** — 3 discrete (Low/Mid/High) vs. continuous slider. Slider has UX weight; start with 3.
5. **Skip-budget interaction with quota** — does "tap to view detail but don't vouch" count toward quota? Recommend NO — quota is about *committed* picks.
6. **Anti-bot strategy** — when do we add CAPTCHA, behavioral checks, or KYC for token-mining qualifying users? Likely needed before P10.
7. **Resolution metric for non-numeric sources** (news articles, blog posts) — is "engagement_score delta" a fair proxy? Or exclude these sources from Discover entirely?

---

## 19. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Time-decay coefficients wrong → degenerate "wait and see" meta | M | H | Closed beta tune, continuous monitoring of late-vouch ratio |
| Share artifacts don't go viral → growth assumption fails | M | H | Build Twitter Card / OG preview testing into P6 deliverable |
| KR Battle users churn during transition | L | M | Grandfather via `/pro-battle`, no forced migration |
| Tokenomics narrative confusion (Activity Mining redefinition) | M | M | Update PD3 deck explicitly in P10. Investor-facing FAQ. |
| YouTube/TikTok API rate limits hit during resolution | M | H | Cache + batch fetches; fall back to engagement_score delta |
| Per-artist cap (max 2/drop) creates bias against prolific groups | L | M | A/B in beta; consider quota by group-collective vs. solo |
| Foreign users find UI unfamiliar (TikTok pattern is universal but not universal-universal) | L | L | Keep mobile shell pattern; lean on familiarity |

---

## 20. Out-of-scope explicit list (so future scope creep is detectable)

- ❌ Live video / clip playback inside the app
- ❌ Comments, replies, social graph
- ❌ Multi-cohort / multi-window predictions ("vouch over 3 days")
- ❌ Custom drops (user-created prediction sets)
- ❌ Cryptocurrency price speculation around $KTNZ inside the app
- ❌ Cross-app integration with non-K-pop content
- ❌ Squad / team play (deferred to v2 if data supports it)

---

## Appendix A — File map (current implementation, P0–P1 done)

| File | Role |
|---|---|
| [src/pages/H1Discover.tsx](../src/pages/H1Discover.tsx) | Page component, both shells, all card components, data hook |
| [src/App.tsx](../src/App.tsx) | Route registration `/h1` |
| [docs/discover_game_mechanics.md](./discover_game_mechanics.md) | 1-pager precedent (mechanics-only, no eng / KPIs) |
| [docs/h1-prd.md](./h1-prd.md) | This document |

## Appendix B — Tokenomics impact summary (for PD3 update)

- **Total mint budget**: unchanged. 4.25B over 10 years.
- **Activity Mining definition**: broadens from "Battle prediction" to "Discover vouch OR Battle prediction."
- **Pre-mint allocation**: unchanged.
- **Phase 0a (current Battle KR Beta)**: continues, attribution unchanged.
- **Phase 0b (Discover global launch)** — NEW row in roadmap before Phase 1.
- **Sink mechanics** unchanged. Discover adds ad-watch slot (non-token), Battle Pass (token burn) applies to both modes.
