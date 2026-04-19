# Core Intent

PROBLEM: Turn volatile multi-source K-Pop social signals (YouTube, TikTok, Instagram, Naver News/Blog) into fair 24-hour content-growth prediction battles where fans earn rewards for accurate calls.

FEATURES:
- Daily B2 prediction battles with tiered growth bands (Steady/Rising/Surge) and 24h settlement (`supabase/functions/ktrenz-trend-settle`, `src/pages/Battle.tsx`)
- Multi-source trend collection pipeline orchestrated as a DB state machine via `ktrenz_pipeline_state` (48 edge functions under `supabase/functions/`)
- K-Cashes economy with Spotify gift-card redemption via Reloadly (`supabase/functions/ktrenz-redeem-giftcard`, `src/pages/SpotifyRedeem.tsx`)

TARGET_USER: K-Pop fans (primarily KR/JP/EN) who want a non-gambling, content-centric way to test their fandom intuition; secondary: B2B agencies looking at trend intelligence (`src/pages/b2b/*`).

# Stack Fingerprint

RUNTIME: Node 20 build toolchain + TypeScript 5; edge runtime is Deno (Supabase Edge Functions)

FRONTEND: React 18 + Vite 5 + Tailwind CSS 3 + shadcn/ui (Radix) + TanStack Query 5

BACKEND: Supabase (Postgres + Auth + Edge Functions + Storage + Cron); 48 edge functions; DB-driven state machine instead of function-to-function HTTP calls

DATABASE: Postgres on Supabase · ~363 migration files in `supabase/migrations/` · types file shows 100+ tables across legacy (k-trendz) and current (ktrenz_*) namespaces · RLS enabled with `SECURITY DEFINER` RPCs for safe bypass

INFRA: Lovable preview + custom domain `ktrenz.com` · Cloudflare Worker (`ktrenz-report-proxy`) fronts Ghost CMS at `/report/*` · Capacitor iOS shell points `server.url` to live web for OTA · no traditional CI

AI_LAYER: LLM-based trend insight generation, commercial keyword extraction, and article subject validation (postprocess); also used for B2B/agency insight cards. Direct OpenAI usage (project policy bans gateway abstractions).

EXTERNAL_API: YouTube Data API (8-key rotation), Naver Search/DataLab, RapidAPI tiktok-api23 (Pro), instagram120, OpenAI, Stripe (subscriptions), Reloadly (Spotify gift cards), Ghost Admin API, Cloudflare API

AUTH: Supabase Auth (email + Google OAuth via `auth.ktrenz.com` custom domain); session resiliency via `onAuthStateChange` priority + `visibilitychange` revalidation

SPECIAL: DB state machine (`ktrenz_pipeline_state`) replacing HTTP function chains; negative-constraint memory files (`mem://constraints/*`) injected into AI context to prevent hallucinations; Cloudflare Worker rewriting Ghost trailing slashes; Capacitor OTA via remote `server.url`

# Failure Log

## Failure 1

SYMPTOM: 72% of keyword detection runs returned `no_keywords` despite the AI clearly producing candidates upstream. Multiple "fix the prompt" iterations made it worse.

CAUSE: A downstream `ownership_confidence < 0.3` filter was silently dropping AI output in **two separate places** in the detect stage — the symptom (empty result) was nowhere near the actual filter.

FIX: Decisive human hint — "filtering is a postprocess concern, not a detect concern." Removed both filters from `detect`, persisted `ownership_confidence` / `ownership_artist` / `ownership_reason` to metadata, and let `postprocess` / `grade` decide. Documented in `.lovable/memory/logic/t2/detection-bottleneck-analysis.md`.

PREVENTION: Memory rule that AI postprocess validation lives in `ktrenz-trend-postprocess`, not in collection (`mem://logic/t2/article-subject-validation`). Pipeline-stage separation is now a constraint, not a convention.

## Failure 2

SYMPTOM: Edge functions chained via HTTP kept hitting Supabase's concurrent-execution ceiling; pipeline would silently stall mid-run and the AI repeatedly proposed adding retries / parallelization, which made it worse and risked paid-API overruns.

CAUSE: Function-to-function HTTP orchestration was the wrong primitive — every retry compounded concurrency. Also, `while(true)` loops over paid Naver/TikTok APIs were a recurring AI suggestion that would have caused billing incidents.

FIX: Replaced HTTP chaining with `ktrenz_pipeline_state` table — each Supabase Cron tick advances exactly one phase. Added `.lovable/memory/constraints/t2-api-safety-policy.md` banning `while(true)` on paid APIs and mandating DB-persisted offsets + hardcoded daily limits matching the actual subscription plan.

PREVENTION: Two memory constraints now in core context every session: `t2-api-safety-policy` (no `while(true)`, hard limits, exec lock, empty-response circuit breaker) and `parallelization-limits` (Naver sequential only, 150ms delay, 429 retry).

# Decision Archaeology

## Decision 1

ORIGINAL_PLAN: Run the full multi-trend-market platform (T2 trend map, K2 prediction markets, Polymarket-style mechanics) alongside the B2 battle.

REASON_TO_CHANGE: Scope and legal risk. Artist-ownership prediction markets created gambling-association concerns; surface area was too wide for a single-context AI codebase. Human decision, not AI-recommended.

FINAL_CHOICE: Battle-exclusive architecture — root `/` renders Battle directly; T2/K2 deprecated. Documented in `mem://vision/battle-exclusive-architecture` and `mem://vision/project-pivot-battle-only`. T2 pages still exist in `src/pages/T2*.tsx` but are not in the active flow.

OUTCOME: Good — single product surface, terminology lockdown ("prediction" not "betting"), faster iteration. Trade-off: significant dead code (T2 pages, V3 components) still in repo, increasing AI confusion risk — mitigated with the `t2-v3-context-separation` constraint memory.

## Decision 2

ORIGINAL_PLAN: Use Lovable AI Gateway for all LLM calls (default platform recommendation).

REASON_TO_CHANGE: Cost predictability and one-secret simplicity for a high-volume keyword/insight pipeline; user already had OpenAI key. AI repeatedly suggested the gateway; rejected.

FINAL_CHOICE: Direct OpenAI (`gpt-4o-mini`) from edge functions, with Gemini as a narrow exception for Expert Analysis. Codified in `mem://constraints/api-providers` and project knowledge ("AI 필요시에 러버블 게이트 웨이 사용 추천 금지").

OUTCOME: Good cost control and no abstraction tax. Trade-off: must manage rate limits and key rotation manually; AI needs explicit reminders not to re-suggest the gateway.

# AI Delegation Map

| Domain | AI % | Human % | Notes |
|--------|------|---------|-------|
| React Components / shadcn UI | 85 | 15 | AI scaffolds, human tweaks layout/i18n strings |
| Edge Function Boilerplate | 80 | 20 | 48 functions; AI writes handlers, human enforces safety constraints |
| DB Schema & Migrations | 55 | 45 | 363 migrations; human decides table boundaries (ktrenz_* vs legacy), AI writes SQL |
| RLS Policies & SECURITY DEFINER RPCs | 40 | 60 | Human-driven security review; AI drafts then human hardens |
| Pipeline Orchestration (state machine) | 25 | 75 | Human-architected after the HTTP-chain failure; AI implements phases |
| Paid API Safety (limits, locks, offsets) | 20 | 80 | Human enforces hard caps; AI tends to over-parallelize without guardrails |
| i18n / Translation Strategy | 70 | 30 | AI handles `translateIfNeeded`; human protects `display_name`/`name_ko` |
| Cloudflare Worker / Ghost Proxy | 60 | 40 | AI writes proxy logic; human discovered trailing-slash + DNS orange-orange issues |
| Memory / Constraint Authoring | 30 | 70 | Human distills recurring corrections into `mem://` files |

# Live Proof

DEPLOYED_URL: https://ktrenz.com (and https://ktrenz.lovable.app)

GITHUB_URL: ? (GitHub connector status not directly inspectable from sandbox)

API_ENDPOINTS: Public Supabase Edge Functions at `https://jguylowswwgjvotdcsfj.supabase.co/functions/v1/<name>` — e.g. `ktrenz-sitemap`, `ktrenz-ghost-publish`, `ktrenz-content-search`. Public report proxy at `https://ktrenz.com/report/*` (Cloudflare Worker → Ghost CMS).

CONTRACT_ADDRESSES: ? (no on-chain components in current B2 scope; legacy `fanz_tokens` / `bot_agents` tables exist in DB types but are out of scope for the active product)

OTHER_EVIDENCE: `public/sitemap.xml`, dynamic sitemap function, Pitch Deck pages (`/pd`, `src/pages/PitchDeck.tsx`), About page with FAQPage JSON-LD (`src/pages/About.tsx`). User-count / revenue numbers not verifiable from code.

# Next Blocker

CURRENT_BLOCKER: knowledge / observability — the DB state machine works but there is no aggregate view of phase latency, paid-API call counts vs hard limits, and per-source empty-response streaks. Decisions about adding sources or scaling cron frequency are currently made blind.

FIRST_AI_TASK: Create a Postgres materialized view `pipeline_health` joining `ktrenz_pipeline_state`, paid-API call logs, and per-source empty-response counters with refresh on cron tick; then build an admin widget under `src/pages/admin/AdminPipelineGuard.tsx` that reads it and flags any source within 20% of its hard limit.

# Integrity Self-Check

PROMPT_VERSION: debut-brief/v1.2

VERIFIED_CLAIMS:
- 48 edge functions under `supabase/functions/` (counted via `ls | wc -l`)
- ~363 migration files under `supabase/migrations/` (counted)
- React 18 + Vite 5 + Tailwind + shadcn/ui + TanStack Query 5 (`package.json`)
- Capacitor iOS present (`capacitor.config.ts`, `ios/` directory)
- DB state machine orchestration: `mem://infrastructure/t2/k2-pipeline-architecture` and constraint memories
- Direct OpenAI policy: `mem://constraints/api-providers` + project knowledge
- Battle-exclusive root: `src/App.tsx` route + `mem://vision/battle-exclusive-architecture`
- Detection bottleneck fix: `.lovable/memory/logic/t2/detection-bottleneck-analysis.md`
- Paid-API safety constraint: `.lovable/memory/constraints/t2-api-safety-policy.md`
- Cloudflare Worker + Ghost: `mem://infrastructure/cloudflare/report-proxy-logic`, `supabase/functions/ktrenz-deploy-cf-worker`
- Reloadly + Spotify: `supabase/functions/ktrenz-redeem-giftcard`, `src/pages/SpotifyRedeem.tsx`

UNVERIFIABLE_CLAIMS:
- Actual user counts, MAU, transaction volume, or revenue
- Whether the live site at ktrenz.com is currently up and serving (not fetched)
- Real production behavior of paid APIs (logs not inspected this turn)
- Exact RLS policy count (types.ts shows tables, not policies)
- GitHub repo URL — no `.git/config` inspection performed
- Whether Stripe subscription is currently transacting
- AI/Human percentages in the delegation map are honest estimates, not measured

DIVERGENCES: None observed in the user template. The user's project knowledge explicitly states "we only service B2 battle; T2/Polymarket deprecated" — the brief reflects that, even though T2 pages still exist in `src/pages/`. Flagging this as a real divergence between repo state and product state, not between brief and repo.

CONFIDENCE_SCORE: 7
