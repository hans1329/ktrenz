# KTrenZ — K-Pop Trend Battle Platform

<p align="center">
  <strong>Real-time K-Pop trend prediction battles powered by multi-source data intelligence</strong>
</p>

<p align="center">
  <a href="https://ktrenz.com">Live App</a> •
  <a href="https://ktrenz.com/about">About</a> •
  <a href="https://ktrenz.com/pd">Pitch Deck</a>
</p>

---

## 🎯 What is KTrenZ?

KTrenZ is a **gamified trend prediction platform** where fans become trend analysts. Users predict which K-Pop artist's content will grow the most in 24 hours, earning K-Cashes based on accuracy.

### Core Loop
```
Content Collection → Prescore → Battle Matching → User Predictions → 24h Settlement → Rewards
```

## ⚔️ Trend Battle System

- **Daily prediction battles** — Pick the artist whose trend will rise more
- **Multi-source scoring** — YouTube, TikTok, Instagram, Naver News/Blog, DataLab
- **Tiered rewards** — Steady (💎50), Rising (💎150), Surge (💎500) based on growth accuracy
- **AI-powered analysis** — GPT-4o-mini trend insights for each matchup
- **Transparent settlement** — 24-hour growth rate calculation with real-time results

## 🏗️ Architecture

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite 5 + TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Backend | Supabase (Auth, DB, Edge Functions, Storage) |
| AI | OpenAI GPT-4o-mini |
| Mobile | Capacitor (iOS) + PWA |
| CDN/Proxy | Cloudflare Workers |
| CMS | Ghost (SEO reports via `/report`) |

### Data Pipeline

```
┌─────────────┐    ┌──────────────┐    ┌───────────────┐
│  Prescore   │───▶│  Autobatch   │───▶│  Collection   │
│ (All Stars) │    │ (Tier Match) │    │ (Round 1 & 2) │
└─────────────┘    └──────────────┘    └───────┬───────┘
                                               │
                   ┌──────────────┐    ┌───────▼───────┐
                   │   Rewards    │◀───│  Settlement   │
                   │  (K-Cashes)  │    │ (Growth Calc) │
                   └──────────────┘    └───────────────┘
```

All pipeline stages are orchestrated via a **DB-driven state machine** (`ktrenz_pipeline_state`) — no direct function-to-function calls.

### Key Tables

| Table | Purpose |
|-------|---------|
| `ktrenz_stars` | Artist registry (SSOT) |
| `ktrenz_b2_runs` | Score snapshots per round |
| `ktrenz_b2_items` | Battle content cards |
| `ktrenz_b2_battles` | Battle state management |
| `b2_predictions` | User predictions |
| `ktrenz_discover_keywords` | Commercial keyword extraction |

## 🔑 Key Design Decisions

- **Content-centric, not artist-ownership** — Users predict content trends, avoiding legal risks
- **"Prediction" not "Betting"** — Terminology policy to prevent gambling associations
- **Anonymous access** — Battle page is publicly viewable without login
- **Membership tiers** — 4 tiers (Beginner → Expert) with daily ticket quotas
- **DB-based orchestration** — All batch processing respects Supabase limits via state machine

## 📱 Platforms

- **Web** — [ktrenz.com](https://ktrenz.com)
- **iOS** — Capacitor-based native app with OTA updates via web
- **PWA** — Installable progressive web app

## 🚀 Getting Started

```bash
git clone <repo-url>
cd ktrenz
npm install
npm run dev
```

Requires `.env` with Supabase credentials. See `.env.example` for reference.

## 📄 License

© 2025 Fantagram, Inc. All rights reserved.

131 Continental Dr. Suite 305, City of Newark, DE 19713 U.S.A.
