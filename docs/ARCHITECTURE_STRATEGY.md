# KTrenZ Architecture Strategy — Vibe Coder's RAG Pack

> A condensed strategy guide for AI agents building gamified data-pipeline platforms.
> Project: **KTrenZ** — K-Pop "Trend Battle" prediction platform (24h growth forecasting).

---

## 1. Core Blueprint — Why This Stack

The problem: turn **volatile, multi-source social signals** (YouTube, TikTok, Instagram, Naver News/Blog, DataLab) into **fair, time-boxed prediction battles** — without legal exposure to artist ownership, and without burning through paid API quotas.

The stack is chosen for **single-context velocity**, not feature richness:

- **React 18 + Vite + Tailwind + shadcn/ui** → one design-token surface (`index.css` HSL variables) so the AI never invents colors. Every component is themable from one file.
- **Supabase (Auth + Postgres + Edge Functions + Storage + Cron)** → eliminates the need for a separate backend repo. The DB *is* the orchestrator.
- **OpenAI GPT-4o-mini direct (no Lovable Gateway)** → predictable cost, one secret, no abstraction tax for keyword classification & battle insight generation.
- **Capacitor + PWA** → iOS shell points `server.url` at the live web domain → **OTA updates without App Store review** for every change except native plugins.
- **Cloudflare Worker + Ghost CMS** → SEO reports rendered server-side at `/report/*`, indexed by Google, completely decoupled from the React SPA.

The synergy: **Supabase Cron → Edge Function → DB state machine → React reads via realtime/queries**. No service mesh, no queue infra, no Kubernetes. One repo, one deploy surface.

---

## 2. Prompt Steering Logic — How to Stop Hallucinations

The single highest-leverage technique was **negative-constraint memory files** (`mem://constraints/*`). The AI is told *what not to do* before it sees the request:

- **`t2-api-safety-policy`**: "Never use `while(true)` to call paid APIs. Always persist offset to DB. Always hardcode daily limits as constants matching the actual subscription plan. Empty responses still bill."
- **`t2-k2-system-boundaries`**: "There is no `tier` column on `ktrenz_stars`. There is no `wiki_entry_id` join. Do not reference V3 tables." → kills 90% of phantom-schema hallucinations.
- **`terminology-policy-prediction`**: "Never use the word *betting*. Use *prediction*, *join*, *growth band*." → enforces legal/brand voice across every generated string.
- **`content-centric-gameplay`**: "Users predict content growth, not artist ownership." → blocks the AI from regenerating gambling-flavored UX.
- **`parallelization-limits`**: "Naver API → sequential only, 150ms delay, retry on 429." → prevents the AI from "optimizing" into a ban.

**Rule**: every recurring correction becomes a memory file within the same session. The memory index is always in context — constraints compound, they don't decay.

---

## 3. Debugging Breakthrough — The Critical Hints

**Symptom**: 72% of keyword detection runs returned `no_keywords`. AI kept "fixing" the prompt.

**Strategic decomposition**:
1. Stopped trusting the symptom. Logged the *raw AI response* before the filter.
2. Discovered the AI was returning keywords — but a downstream `ownership_confidence < 0.3` filter was silently dropping them in **two places**.
3. **Decisive hint**: "Filtering is a *postprocess* concern, not a *detect* concern. Move it down the pipeline; store the score as metadata."
4. Result: detection coverage tripled; postprocess gained richer signal.

**Meta-lesson for the agent**: when a fix doesn't work twice, the bug is *not* where the symptom appears. Walk the pipeline backwards and log at every stage boundary.

A second breakthrough: **Edge functions chaining via HTTP** kept hitting Supabase's concurrent-execution ceiling. Replaced with a `ktrenz_pipeline_state` table — each cron tick advances one phase. **Functions stopped calling functions; the DB became the conductor.**

---

## 4. Scale-up Tip — The Next Move

**First instruction to give your AI**: *"Add a `pipeline_health` materialized view that surfaces phase latency, API call counts vs hard limits, and empty-response streaks per source — then build an admin dashboard widget that reads it."*

Why this first: every future scaling decision (more sources, more artists, paid tiers) depends on **observability of the existing state machine**. Without it, the AI will optimize blind. With it, the agent can autonomously detect bottlenecks and propose targeted fixes — turning the platform from human-supervised to self-diagnosing.
