/**
 * /h1 — Discover game (Content-First "이게 뜰까?")
 * Mobile: full-screen vertical feed.
 * Desktop: full-width header + sidebar + card grid.
 * Spec: docs/discover_game_mechanics.md
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import SEO from "@/components/SEO";
import {
  Sparkles, Clock, Eye, Share2, Trophy, History, Flame,
  Youtube, Music2, Newspaper, Play, X, ChevronRight, Check,
  Zap, TrendingUp, Users, Loader2, ExternalLink,
  Sprout, Activity, Rocket, HelpCircle,
} from "lucide-react";
import ktrenzLogo from "@/assets/logo_nd.webp";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLanguage } from "@/contexts/LanguageContext";
import { useFieldTranslation } from "@/hooks/useFieldTranslation";
import { useAuth } from "@/contexts/AuthContext";
import { useH1Status, type ConfidenceTier } from "@/hooks/useH1Status";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { trackH1Event } from "@/lib/h1Telemetry";
import H1AuthChip from "@/components/h1/H1AuthChip";
import H1HowItWorksModal from "@/components/h1/H1HowItWorksModal";
import H1CallConfirmDialog from "@/components/h1/H1CallConfirmDialog";
import H1AdUnlockDialog from "@/components/h1/H1AdUnlockDialog";
import H1AppHeader from "@/components/h1/H1AppHeader";
import H1Landing from "@/components/h1/H1Landing";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/* ─────── Types ─────── */
type Source = "youtube" | "tiktok" | "shorts" | "spotify" | "news" | "naver_news" | "naver_blog" | "instagram" | "reddit" | string;
type Vouch = "low" | "mid" | "high";
type SlotState = {
  low:  { remaining: number; disabled: boolean };
  mid:  { remaining: number; disabled: boolean };
  high: { remaining: number; disabled: boolean };
};

/* Lightweight placeholder substitution for translated strings — t() in this
 * project only does dict lookup, so we handle {key} interpolation here. */
function tFmt(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

type DiscoverCard = {
  id: string;
  source: Source;
  title: string;
  description: string;
  artist: string;
  starId: string | null;          // for IG media resolver
  starImage: string | null;
  thumbnail: string | null;
  url: string;
  currentViews: number;
  publishedAt: string | null;
  paletteA: string;
  paletteB: string;
  paletteC: string;
};

/* ─────── Constants ─────── */
const DROP_SIZE = 24; // Today's Drop curated count
// Daily quota = total slot caps (1 ×1 + 4 ×2 + 2 ×4) when the cohort is full.
// When the curator returns fewer than 24 (e.g. PER_ARTIST_CAP=1 + sparse
// pool yields 12 unique artists), scale proportionally so the leaderboard
// gate isn't impossible to clear.
const DAILY_QUOTA_TARGET_MAX = 7;
function quotaTargetFor(cohortSize: number): number {
  if (cohortSize <= 0) return DAILY_QUOTA_TARGET_MAX;
  // Floor instead of ceil — 12장이면 12*7/24=3.5를 4가 아닌 3으로 잡아 빡빡한
  // 비율 유지. 작은 cohort에서 quota target이 사실상 달성 불가능해지는 일을
  // 막으면서, 일관된 "전체의 절반 미만" 기준 유지.
  return Math.max(1, Math.min(DAILY_QUOTA_TARGET_MAX, Math.floor((cohortSize * DAILY_QUOTA_TARGET_MAX) / DROP_SIZE)));
}
const VOUCH_STORAGE_KEY_PREFIX = "ktrenz-h1-vouches-"; // + YYYY-MM-DD

/* ─────── Per-artist palette ─────── */
// Deterministic palette from artist name hash so the same artist
// gets a consistent visual fingerprint across sessions.
const PALETTES: Array<{ a: string; b: string; c: string }> = [
  { a: "#ff2e63", b: "#7028e4", c: "#0a0a14" },
  { a: "#00d4ff", b: "#0066ff", c: "#001120" },
  { a: "#c084fc", b: "#7c3aed", c: "#1a0a2e" },
  { a: "#34d399", b: "#059669", c: "#0a1f17" },
  { a: "#ff8a3d", b: "#dc2626", c: "#1f0a08" },
  { a: "#facc15", b: "#ea580c", c: "#1f1308" },
  { a: "#60a5fa", b: "#1d4ed8", c: "#0a1530" },
  { a: "#f472b6", b: "#9333ea", c: "#1f0a1f" },
  { a: "#a3e635", b: "#16a34a", c: "#0e1f0a" },
  { a: "#fb7185", b: "#be123c", c: "#1f0810" },
];

function paletteFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTES[h % PALETTES.length];
}
const HEADER_H = 80;        // px — H1AppHeader (48) + sub-strip (~30) + hairline (2)
const BOTTOM_NAV_H = 68;    // px — bottom nav height
export { BOTTOM_NAV_H };

/* ─────── Helpers ─────── */
function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function sourceMeta(s: Source) {
  switch (s) {
    case "youtube":    return { Icon: Youtube,   label: "YouTube"   };
    case "tiktok":     return { Icon: Music2,    label: "TikTok"    };
    case "shorts":     return { Icon: Play,      label: "Shorts"    };
    case "spotify":    return { Icon: Music2,    label: "Spotify"   };
    case "news":       return { Icon: Newspaper, label: "News"      };
    case "naver_news": return { Icon: Newspaper, label: "Naver"     };
    case "naver_blog": return { Icon: Newspaper, label: "Blog"      };
    case "instagram":  return { Icon: Music2,    label: "Instagram" };
    case "reddit":     return { Icon: Newspaper, label: "Reddit"    };
    default:           return { Icon: Sparkles,  label: String(s)   };
  }
}

function hoursAgo(iso: string | null): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 3_600_000));
}

// Convert an "W / H" aspect-ratio string to a padding-bottom percentage so we
// can size cross-origin iframes via the legacy aspect-ratio hack (which works
// reliably across browsers, unlike the modern `aspect-ratio` CSS prop).
function aspectToPadding(aspect: string): string {
  const [w, h] = aspect.split("/").map((s) => parseFloat(s.trim()));
  if (!w || !h || isNaN(w) || isNaN(h)) return "56.25%"; // 16:9 fallback
  return `${((h / w) * 100).toFixed(3)}%`;
}

function formatAge(iso: string | null): string {
  const h = hoursAgo(iso);
  if (h < 1) return "<1h ago";
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "1d ago" : `${d}d ago`;
}

// Extract YouTube/Shorts video ID for iframe embed.
// Returns null when the URL isn't a recognizable YouTube link.
// Mirrors Battle.tsx's permissive regex — handles m.youtube.com, www, mobile,
// short URLs, embed URLs all in one pass. The 11-char ID anchor is a YouTube
// invariant.
function youtubeVideoId(url: string): string | null {
  const m = url.match(/(?:v=|\/embed\/|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m?.[1] ?? null;
}

// Pick an iframe embed strategy based on source URL.
// Each embed declares its own aspect ratio so the modal renders at native size.
// Returns null when no inline embed is supported (news, blog, spotify, etc.).
type EmbedInfo = { kind: "youtube" | "tiktok" | "instagram"; src: string; aspect: string };
function getEmbed(card: DiscoverCard): EmbedInfo | null {
  const ytId = youtubeVideoId(card.url);
  // Permissive: any URL that looks like YouTube (valid ID extracted) gets the
  // embed, even if `source` is misclassified upstream. Battle does the same.
  if (ytId) {
    const isShorts = card.source === "shorts" || /\/shorts\//.test(card.url);
    return {
      kind: "youtube",
      src: `https://www.youtube.com/embed/${ytId}?rel=0&autoplay=1&mute=0`,
      aspect: isShorts ? "9 / 16" : "16 / 9",
    };
  }
  if (card.source === "tiktok") {
    const m = card.url.match(/\/video\/(\d+)/);
    if (m) {
      return {
        kind: "tiktok",
        // TikTok player/v1 endpoint — official Player API that supports
        // autoplay/controls query params reliably (embed/v2 ignores them).
        src: `https://www.tiktok.com/player/v1/${m[1]}?autoplay=1&mute=0&music_info=1&description=0&controls=1&progress_bar=1&play_button=1&volume_control=1&loop=0&rel=0`,
        // player/v1 is just the video frame (no chrome), close to 9:16.
        aspect: "9 / 16",
      };
    }
  }
  // Instagram intentionally returns null — the /embed iframe shows a poster
  // but blocks playback (autoplay AND tap-to-play). DetailDrawer special-
  // cases IG to render a tap-to-open CTA over the thumbnail instead, which
  // deeplinks into the Instagram app or web for real playback.
  return null;
}

/* ─────── Data hook ─────── */
//
// Resolution path (P3): the curate cron pre-populates ktrenz_h1_daily_drop and
// the client fetches via ktrenz_h1_get_today_drop RPC. Until the cron is wired
// up, today's drop may be empty — fall back to a direct ktrenz_b2_items query
// so the UI works during the rollout. Once curation runs reliably, the
// fallback is silently bypassed.

type NormalizedRow = {
  id: string;             // item_id used by the client and vouch RPC
  source: string;
  title: string | null;
  title_en: string | null;
  title_ja: string | null;
  title_zh: string | null;
  title_ko: string | null;
  description: string | null;
  description_en: string | null;
  description_ja: string | null;
  description_zh: string | null;
  description_ko: string | null;
  thumbnail: string | null;
  url: string;
  engagement_score: number | null;
  published_at: string | null;
  artist: string;
  starId: string | null;  // needed by Instagram media resolver
  starImage: string | null;
};

// Naver/news scrapers return raw HTML so titles often contain entities like
// &lsquo; / &rsquo; / &amp;. React doesn't decode these in text nodes (correct
// for XSS), so we decode at read time. Covers named + numeric entities.
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'",
  nbsp: " ", hellip: "…", mdash: "—", ndash: "–", middot: "·",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  laquo: "«", raquo: "»", copy: "©", reg: "®", trade: "™",
};
function decodeEntities(s: string): string {
  if (!s) return s;
  return s
    .replace(/&([a-zA-Z]+);/g, (m, name) => NAMED_ENTITIES[name] ?? m)
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => {
      const code = parseInt(n, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    });
}

function pickLocalized(row: any, base: "title" | "description", language: string): string {
  const v =
    language === "ko" ? row[`${base}_ko`] :
    language === "ja" ? row[`${base}_ja`] :
    language === "zh" ? row[`${base}_zh`] :
    row[`${base}_en`];
  return decodeEntities(v || row[base] || "");
}

function buildCard(row: NormalizedRow, language: string): DiscoverCard {
  const palette = paletteFor(row.artist || row.id);
  return {
    id: row.id,
    source: row.source as Source,
    title: pickLocalized(row, "title", language),
    description: pickLocalized(row, "description", language),
    artist: row.artist,
    starId: row.starId,
    starImage: row.starImage,
    thumbnail: row.thumbnail,
    url: row.url,
    currentViews: Math.round(row.engagement_score ?? 0),
    publishedAt: row.published_at,
    paletteA: palette.a,
    paletteB: palette.b,
    paletteC: palette.c,
  };
}

async function fetchCuratedDrop(): Promise<NormalizedRow[]> {
  const { data, error } = await (supabase as any).rpc("ktrenz_h1_get_today_drop", {
    _region: "global",
  });
  if (error) {
    console.warn("[h1] get_today_drop RPC failed, falling back:", error);
    return [];
  }
  if (!Array.isArray(data) || data.length === 0) return [];
  return (data as any[]).map((r) => ({
    id: r.item_id,
    source: r.source,
    title: r.title,
    title_en: r.title_en,
    title_ja: r.title_ja,
    title_zh: r.title_zh,
    title_ko: r.title_ko,
    description: r.description,
    description_en: r.description_en,
    description_ja: r.description_ja,
    description_zh: r.description_zh,
    description_ko: r.description_ko,
    thumbnail: r.thumbnail,
    url: r.url,
    engagement_score: r.engagement_score,
    published_at: r.published_at,
    artist: r.star_display_name || "Unknown",
    starId: r.star_id ?? null,
    starImage: r.star_image_url,
  }));
}

async function fetchFallbackPool(): Promise<NormalizedRow[]> {
  const { data: items, error } = await (supabase
    .from("ktrenz_b2_items") as any)
    .select(
      "id, source, title, title_en, title_ja, title_zh, title_ko, description, description_en, description_ja, description_zh, description_ko, thumbnail, url, engagement_score, star_id, published_at",
    )
    .eq("has_thumbnail", true)
    .not("source", "eq", "naver_blog")
    .not("thumbnail", "is", null)
    .order("engagement_score", { ascending: false, nullsFirst: false })
    .limit(150);

  if (error || !items?.length) return [];

  // Per-artist cap + URL dedup, then trim to DROP_SIZE.
  const seenUrls = new Set<string>();
  const seenStars = new Map<string, number>();
  const dedup: any[] = [];
  for (const it of items) {
    if (!it.url || seenUrls.has(it.url)) continue;
    const seenForStar = seenStars.get(it.star_id) ?? 0;
    if (seenForStar >= 2) continue;
    seenUrls.add(it.url);
    seenStars.set(it.star_id, seenForStar + 1);
    dedup.push(it);
    if (dedup.length >= DROP_SIZE) break;
  }

  const starIds = [...new Set(dedup.map((i) => i.star_id as string))].filter(Boolean) as string[];
  const { data: stars } = await supabase
    .from("ktrenz_stars")
    .select("id, display_name, image_url")
    .in("id", starIds);
  const starMap = new Map((stars || []).map((s: any) => [s.id, s]));

  return dedup.map((item) => {
    const star = starMap.get(item.star_id);
    return {
      id: item.id,
      source: item.source,
      title: item.title,
      title_en: item.title_en,
      title_ja: item.title_ja,
      title_zh: item.title_zh,
      title_ko: item.title_ko,
      description: item.description,
      description_en: item.description_en,
      description_ja: item.description_ja,
      description_zh: item.description_zh,
      description_ko: item.description_ko,
      thumbnail: item.thumbnail,
      url: item.url,
      engagement_score: item.engagement_score,
      published_at: item.published_at,
      artist: star?.display_name || "Unknown",
      starId: item.star_id ?? null,
      starImage: star?.image_url || null,
    };
  });
}

function useDiscoverCards() {
  const { language } = useLanguage();
  const { translateIfNeeded } = useFieldTranslation();
  return useQuery({
    queryKey: ["h1-discover-cards", language],
    queryFn: async (): Promise<DiscoverCard[]> => {
      // 1. Try server-curated drop (P3 path).
      let rows = await fetchCuratedDrop();

      // 2. Fall back to direct b2_items query when drop is empty.
      if (rows.length === 0) rows = await fetchFallbackPool();
      if (rows.length === 0) return [];

      // 3. Trigger on-demand translation for missing fields in current language.
      // Fires async — first render shows source-language fallback, subsequent
      // renders pick up the translated columns.
      void translateIfNeeded("ktrenz_b2_items", "title", rows as any[]);
      void translateIfNeeded("ktrenz_b2_items", "description", rows as any[]);

      return rows.map((r) => buildCard(r, language));
    },
    staleTime: 1000 * 60 * 5,
  });
}

/* ─────── Vouch persistence (localStorage, scoped per day + owner) ───────
 *
 * Key shape: `ktrenz-h1-vouches-{owner}-YYYY-MM-DD`
 *   owner = user uuid for authed sessions
 *   owner = "anon"     for guest sessions
 *
 * Why owner-scoped: previously all users shared one date-only key. A → 로그
 * 아웃 → B 로그인 시 A의 vouch가 그대로 화면에 남고, login-flip 효과가
 * A의 localStorage entry를 B 계정으로 record_vouch 호출해서 데이터 누수.
 */
function ownerToken(userId: string | null | undefined): string {
  return userId && userId.length > 0 ? userId : "anon";
}

function todayKey(userId: string | null | undefined): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${VOUCH_STORAGE_KEY_PREFIX}${ownerToken(userId)}-${y}-${m}-${day}`;
}

function loadVouches(userId: string | null | undefined): Record<string, Vouch> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(todayKey(userId));
    return raw ? (JSON.parse(raw) as Record<string, Vouch>) : {};
  } catch {
    return {};
  }
}

function saveVouches(userId: string | null | undefined, v: Record<string, Vouch>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(todayKey(userId), JSON.stringify(v));
  } catch { /* ignore */ }
}

function clearVouches(userId: string | null | undefined) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(todayKey(userId));
  } catch { /* ignore */ }
}

function useCountdown(toMs: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const remain = Math.max(0, toMs - now);
  const h = Math.floor(remain / 3_600_000);
  const m = Math.floor((remain % 3_600_000) / 60_000);
  const s = Math.floor((remain % 60_000) / 1000);
  return { h, m, s, done: remain === 0 };
}

/* ─────── Image plate (clean — for section-divided cards) ─────── */
function ImagePlate({ card }: { card: DiscoverCard }) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const showThumb = !!card.thumbnail && !thumbFailed;
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ backgroundColor: card.paletteC }}>
      {showThumb ? (
        <>
          <img
            src={card.thumbnail!}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            referrerPolicy="no-referrer"
            decoding="async"
            loading="lazy"
            onError={() => setThumbFailed(true)}
          />
          {/* Subtle top vignette for chip legibility */}
          <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/55 to-transparent pointer-events-none" />
        </>
      ) : (
        <>
          {/* Palette gradient fallback */}
          <div className="absolute -top-1/4 -left-1/4 w-[120%] h-[80%] rounded-full blur-[80px] opacity-65" style={{ background: card.paletteA }} />
          <div className="absolute -bottom-1/4 -right-1/4 w-[100%] h-[80%] rounded-full blur-[100px] opacity-55" style={{ background: card.paletteB }} />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-white/[0.18] text-[5rem] font-black tracking-tighter leading-none select-none">
              {card.artist.replace(/^@/, "").slice(0, 4).toUpperCase()}
            </div>
          </div>
        </>
      )}
      {/* Grain — subtle premium texture */}
      <div
        className="absolute inset-0 opacity-[0.05] mix-blend-overlay pointer-events-none"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  );
}

/* ─────── Vouch button ─────── */
// Three levels of conviction — label + icon + color carry the meaning.
// Earlier had abstract "1×/2×/4×" multipliers in the UI; testing showed
// users read them as "min 1× ?" — meaningless in isolation. Removed.
// Labels are i18n keys so callers translate at render-time.
// `mult` is the displayed reward multiplier (low=baseline=×1). Internal
// confidence_weight in resolve-drop is 0.5/1/2 — shown to users as 1/2/4
// for cleaner mental model (no fractions).
const VOUCH_META = {
  low:  { labelKey: "h1.confidence.hunch",  hintKey: "h1.confidence.hunchHint",   icon: Sprout,   mult: 1, shade: "from-amber-400 to-amber-500",  ring: "ring-amber-400/40",  glow: "shadow-amber-400/30" },
  mid:  { labelKey: "h1.confidence.likely", hintKey: "h1.confidence.likelyHint",  icon: Activity, mult: 2, shade: "from-orange-400 to-orange-500", ring: "ring-orange-400/40", glow: "shadow-orange-500/30" },
  high: { labelKey: "h1.confidence.sure",   hintKey: "h1.confidence.sureHint",    icon: Rocket,   mult: 4, shade: "from-rose-400 to-red-500",     ring: "ring-rose-400/50",   glow: "shadow-rose-500/40" },
} as const;

function VouchPill({
  level,
  active,
  onClick,
  disabled,
}: {
  level: "low" | "mid" | "high";
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  const { t } = useLanguage();
  const c = VOUCH_META[level];
  const Icon = c.icon;
  return (
    <button
      onClick={onClick}
      disabled={disabled && !active}
      className={cn(
        "relative flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl transition-all overflow-hidden border",
        active
          ? `bg-gradient-to-b ${c.shade} text-white shadow-lg ${c.glow} border-white/30 scale-[1.03] ring-1 ${c.ring}`
          : disabled
            ? "bg-white/[0.03] text-white/30 border-white/5 cursor-not-allowed"
            : "bg-white/[0.06] backdrop-blur-md text-white border-white/10 hover:bg-white/10 hover:border-white/20 active:scale-95",
      )}
    >
      <Icon
        className={cn(
          "w-4 h-4 transition-transform shrink-0",
          active ? "drop-shadow" : disabled ? "opacity-40" : "opacity-80",
          level === "high" && active && "animate-pulse",
        )}
        strokeWidth={active ? 2.5 : 2}
      />
      <span className="text-[17px] font-black tabular-nums tracking-tight leading-none">×{c.mult}</span>
    </button>
  );
}

/* ─────── Card ─────── */
function ContentCardFull({
  card,
  vouch,
  onVouch,
  onOpenDetail,
  onScrollNext,
  onOpenHelp,
  slotState,
}: {
  card: DiscoverCard;
  vouch: Vouch | undefined;
  onVouch: (v: Vouch) => void;
  onOpenDetail: () => void;
  onScrollNext: () => void;
  onOpenHelp: () => void;
  slotState?: SlotState;
}) {
  const { t } = useLanguage();
  const { Icon, label } = sourceMeta(card.source);
  const decided = !!vouch;

  return (
    <section
      className="snap-start shrink-0 h-full w-full relative bg-neutral-950 flex flex-col"
      style={{ paddingTop: HEADER_H, paddingBottom: BOTTOM_NAV_H }}
    >
      {/* ── Section 1: Image (top half, shrinkable when text needs more) ── */}
      <button
        type="button"
        onClick={onOpenDetail}
        className="relative w-full bg-neutral-900 overflow-hidden"
        style={{ flex: "0 1 50%", minHeight: "30%" }}
        aria-label="Open detail"
      >
        <ImagePlate card={card} />
        {/* Source + age chips */}
        <div className="absolute top-3 inset-x-3 z-10 flex items-center justify-between gap-2 pointer-events-none">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/55 backdrop-blur-md border border-white/15 text-white text-[11px] font-semibold">
            <Icon className="w-3 h-3" /> {label}
          </div>
          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/55 backdrop-blur-md border border-white/15 text-white/85 text-[11px] font-medium">
            <Clock className="w-2.5 h-2.5" /> {hoursAgo(card.publishedAt)}h
          </div>
        </div>
      </button>

      {/* ── Section 2: Text + vouch (bottom half) ── */}
      <div className="flex-1 min-h-0 flex flex-col px-5 pt-4 pb-3 bg-neutral-950">
        {/* Title block — shrinkable so the buttons row never gets pushed
            behind the BottomNav when content is long. line-clamp keeps it
            readable while min-h-0 + flex-1 lets it absorb pressure. */}
        <button
          type="button"
          onClick={onOpenDetail}
          className="block text-left w-full mb-3 flex-1 min-h-0 overflow-hidden"
        >
          <div className="flex items-center gap-2 mb-2">
            {card.starImage ? (
              <img
                src={card.starImage}
                alt=""
                className="w-5 h-5 rounded-full object-cover ring-1 ring-white/15"
                referrerPolicy="no-referrer"
                loading="lazy"
              />
            ) : (
              <div className="w-5 h-5 rounded-full bg-white/10" />
            )}
            <span className="text-xs font-bold text-white/70 tracking-wide uppercase truncate">
              {card.artist}
            </span>
          </div>
          <h2 className="text-[18px] leading-[1.3] font-medium text-white tracking-tight mb-2 line-clamp-3">
            {card.title}
          </h2>
          <div className="text-white/45 text-xs">
            {t("h1.tapForDetails")}
          </div>
        </button>

        {/* Buttons row pinned at bottom of text area — shrink-0 protects it
            from the title block crowding it out. */}
        <div className="shrink-0">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="flex flex-col gap-0.5">
              <div className="inline-flex items-center gap-1.5 text-white text-[13px] font-black tracking-tight">
                <TrendingUp className="w-3.5 h-3.5 text-rose-300" />
                {t("h1.willGoViralFull")}
              </div>
              <div className="text-white/55 text-[11px] font-medium pl-[18px]">
                {t("h1.callStrengthPrompt")}
              </div>
            </div>
            <button
              onClick={onOpenHelp}
              className="text-white/40 hover:text-white/80 transition-colors shrink-0"
              aria-label={t("h1.howItWorks")}
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex gap-2">
            <VouchPill level="low"  active={vouch === "low"}  onClick={() => onVouch("low")}  disabled={slotState?.low.disabled} />
            <VouchPill level="mid"  active={vouch === "mid"}  onClick={() => onVouch("mid")}  disabled={slotState?.mid.disabled} />
            <VouchPill level="high" active={vouch === "high"} onClick={() => onVouch("high")} disabled={slotState?.high.disabled} />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────── Detail drawer ─────── */
// Mirrors Battle.tsx InstagramEmbed: resolves the IG URL into raw video/image
// URLs via the ktrenz-instagram-media edge function (RapidAPI behind the
// scenes), then plays via native <video> with autoplay+muted (Mobile Safari
// requires both flags set + playsInline). The /embed iframe path is dead end
// — IG actively blocks playback inside its own embed.
//
// Caching strategy (resolver is slow — 2-5s on cold paths):
//   1. Per-session in-memory Map for instant re-opens within a tab
//   2. localStorage with 25-min TTL — IG CDN video URLs typically live ~30
//      min, so 25 stays safely under expiry. Survives reload + cross-tab.
type IgMedia = { type: "video" | "image"; url: string; poster?: string | null };
const igMediaCache = new Map<string, IgMedia[]>();
const IG_CACHE_TTL_MS = 25 * 60 * 1000;

function igCacheKey(itemId: string): string { return `ktrenz-h1-ig:${itemId}`; }

function readIgCache(itemId: string): IgMedia[] | null {
  try {
    const raw = localStorage.getItem(igCacheKey(itemId));
    if (!raw) return null;
    const { ts, items } = JSON.parse(raw) as { ts: number; items: IgMedia[] };
    if (Date.now() - ts > IG_CACHE_TTL_MS) {
      localStorage.removeItem(igCacheKey(itemId));
      return null;
    }
    return Array.isArray(items) && items.length ? items : null;
  } catch {
    return null;
  }
}

function writeIgCache(itemId: string, items: IgMedia[]): void {
  try {
    localStorage.setItem(igCacheKey(itemId), JSON.stringify({ ts: Date.now(), items }));
  } catch { /* quota — ignore */ }
}

// Mirror Battle.tsx's working <video> usage exactly — no .play() retries,
// no JS muted property override. Just attribute-based autoplay+muted+
// playsInline, which the browser respects natively. Earlier programmatic
// retries were interfering with native autoplay timing on iOS Safari.
function IgVideo({
  src,
  poster,
  onLoadError,
}: {
  src: string;
  poster?: string;
  onLoadError?: () => void;
}) {
  return (
    <video
      key={src}
      src={src}
      poster={poster}
      className="w-full h-full object-contain"
      controls
      autoPlay
      muted
      playsInline
      preload="metadata"
      onError={() => {
        console.warn("[h1] IG video load error — URL may be expired");
        onLoadError?.();
      }}
    />
  );
}

function H1InstagramEmbed({ card }: { card: DiscoverCard }) {
  // Initial state: prefer in-memory, then localStorage. Both pre-warm the
  // component so we skip the spinner entirely on repeat views.
  const initial = igMediaCache.get(card.id) ?? readIgCache(card.id);
  if (initial && !igMediaCache.has(card.id)) igMediaCache.set(card.id, initial);
  const [items, setItems] = useState<IgMedia[] | null>(initial);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(!initial);
  const [retryCount, setRetryCount] = useState(0);  // bump to force re-fetch
  const triedFreshRef = useRef(false);

  useEffect(() => { setActiveIdx(0); triedFreshRef.current = false; }, [card.id]);

  useEffect(() => {
    if (!card.starId) {
      setLoading(false);
      setItems(null);
      return;
    }
    // Already memoized in this tab? Skip.
    if (igMediaCache.has(card.id)) return;
    // localStorage hit?
    const persisted = readIgCache(card.id);
    if (persisted) {
      igMediaCache.set(card.id, persisted);
      setItems(persisted);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setItems(null);
    const t0 = performance.now();

    // Three-layer cache lookup before falling through to the slow resolver:
    //   1. DB shared cache (RPC, ~50-100ms) — warms across all users/devices
    //      via curate-time prefetch + on-demand writes from past calls
    //   2. (skipped here — handled by tab+localStorage above)
    //   3. RapidAPI feed fetch (slow, 2-5s)
    const isForced = retryCount > 0;
    (async () => {
      // Layer 1: DB cache RPC (skipped on retry — cache likely has the
      // expired URL we just failed on).
      if (!isForced) {
        try {
          const { data: cached } = await (supabase as any).rpc("ktrenz_h1_ig_cached_media", { _item_id: card.id });
          if (cached && Array.isArray(cached) && cached.length > 0 && !cancelled) {
            const list = (cached as any[]).filter((e) => e?.type && e?.url) as IgMedia[];
            if (list.length) {
              igMediaCache.set(card.id, list);
              writeIgCache(card.id, list);
              console.info(`[h1] IG db_cache_hit ${Math.round(performance.now() - t0)}ms`);
              setItems(list);
              setLoading(false);
              return;
            }
          }
        } catch (err) {
          // RPC may not exist yet (pre-migration) — fall through silently
          console.debug("[h1] IG db cache RPC unavailable:", err);
        }
      }

      // Layer 3: edge function → RapidAPI (force=true on retry to bypass
      // server-side DB cache too).
      const { data, error } = await supabase.functions
        .invoke("ktrenz-instagram-media", {
          body: { star_id: card.starId, item_url: card.url, item_id: card.id, force: isForced },
        });
      if (cancelled) return;
      if (error) {
        console.warn("[h1] IG media resolve failed:", error);
        setItems(null);
        setLoading(false);
        return;
      }
      const list = Array.isArray(data?.items)
        ? (data.items as any[]).filter((e) => e?.type && e?.url) as IgMedia[]
        : [];
      if (!list.length) {
        setItems(null);
        setLoading(false);
        return;
      }
      igMediaCache.set(card.id, list);
      writeIgCache(card.id, list);
      const dt = Math.round(performance.now() - t0);
      const layer = (data as any)?.cache_layer ?? "rapidapi";
      console.info(`[h1] IG resolved (${layer}) in ${dt}ms (${list.length} items)`);
      setItems(list);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [card.id, card.url, card.starId, retryCount]);

  const total = items?.length ?? 0;
  const active = total > 0 ? items?.[Math.min(activeIdx, total - 1)] ?? null : null;

  if (loading) {
    // Show thumbnail behind the spinner so the user sees the content
    // immediately while the IG resolver runs (cold call ~2-5s).
    return (
      <div className="absolute inset-0 bg-neutral-950">
        {card.thumbnail ? (
          <img
            src={card.thumbnail}
            alt=""
            className="absolute inset-0 w-full h-full object-cover blur-sm opacity-50"
            referrerPolicy="no-referrer"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${card.paletteA}, ${card.paletteB})` }} />
        )}
        <div className="absolute inset-0 grid place-items-center">
          <div className="flex flex-col items-center gap-2.5 px-4 py-3 rounded-2xl bg-black/55 backdrop-blur-sm">
            <Loader2 className="w-5 h-5 animate-spin text-white/85" />
            <span className="text-[11px] font-bold text-white/75 tracking-wider uppercase">Instagram</span>
          </div>
        </div>
      </div>
    );
  }
  if (!active) {
    // Resolver failed → tap-to-open IG fallback so the user isn't stuck.
    return (
      <a href={card.url} target="_blank" rel="noopener noreferrer" className="absolute inset-0 group">
        {card.thumbnail ? (
          <img
            src={card.thumbnail}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            referrerPolicy="no-referrer"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${card.paletteA}, ${card.paletteB})` }} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <div className="w-14 h-14 rounded-full bg-white/95 grid place-items-center shadow-2xl group-hover:scale-105 transition-transform">
            <Play className="w-6 h-6 text-black fill-black ml-1" />
          </div>
        </div>
        <div className="absolute bottom-3 inset-x-0 flex items-center justify-center">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 text-white text-xs font-black shadow-lg">
            <ExternalLink className="w-3 h-3" />
            Instagram에서 재생
          </span>
        </div>
      </a>
    );
  }
  return (
    <div className="absolute inset-0 bg-black flex items-center justify-center">
      {active.type === "video" ? (
        <IgVideo
          key={`${card.id}-${activeIdx}-${retryCount}`}
          src={active.url}
          poster={active.poster || card.thumbnail || undefined}
          onLoadError={() => {
            // URL likely expired (IG CDN URLs ~30 min). Drop caches and force
            // a fresh resolve, but only once per card to avoid loops.
            if (triedFreshRef.current) return;
            triedFreshRef.current = true;
            console.info("[h1] IG video URL likely expired — refetching fresh");
            igMediaCache.delete(card.id);
            try { localStorage.removeItem(igCacheKey(card.id)); } catch { /* ignore */ }
            setItems(null);
            setLoading(true);
            setRetryCount((c) => c + 1);
          }}
        />
      ) : (
        <img
          src={active.url}
          alt={card.title}
          className="w-full h-full object-contain"
          referrerPolicy="no-referrer"
        />
      )}
      {total > 1 && (
        <>
          <button
            type="button"
            onClick={() => setActiveIdx((i) => (i - 1 + total) % total)}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/55 hover:bg-black/75 p-1.5 text-white shadow"
            aria-label="Previous"
          >
            <ChevronRight className="w-4 h-4 rotate-180" />
          </button>
          <button
            type="button"
            onClick={() => setActiveIdx((i) => (i + 1) % total)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/55 hover:bg-black/75 p-1.5 text-white shadow"
            aria-label="Next"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 backdrop-blur">
            {items!.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveIdx(i)}
                className={cn("w-1.5 h-1.5 rounded-full", i === activeIdx ? "bg-white" : "bg-white/40")}
                aria-label={`Slide ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function DetailDrawer({
  card,
  cards,
  open,
  onClose,
}: {
  card: DiscoverCard | null;
  cards: DiscoverCard[];
  open: boolean;
  onClose: () => void;
}) {
  const { Icon, label } = card ? sourceMeta(card.source) : { Icon: () => null, label: "" };
  const embed = card ? getEmbed(card) : null;

  // Live rank within today's cohort — sort by currentViews desc and find
  // the index. This is the predictor's most decisive context ("내 픽이
  // 지금 24장 중 #5라는 것"이 게임의 모든 의사결정의 기반).
  const rankInfo = useMemo(() => {
    if (!card || cards.length === 0) return null;
    const sorted = [...cards].sort((a, b) => b.currentViews - a.currentViews);
    const idx = sorted.findIndex((c) => c.id === card.id);
    return idx >= 0 ? { rank: idx + 1, total: sorted.length } : null;
  }, [card, cards]);

  // Views-per-hour since published — rough viral velocity proxy. Without
  // item-level historical snapshots this is the best signal we can derive
  // from the columns we already store. For items with fallback contentScore
  // (Naver/Reddit) the number is mostly noise; we still show it so all
  // items render the same shape — let users learn which sources to trust.
  const velocityInfo = useMemo(() => {
    if (!card || !card.publishedAt) return null;
    const publishedMs = new Date(card.publishedAt).getTime();
    if (Number.isNaN(publishedMs)) return null;
    const hours = Math.max(1, (Date.now() - publishedMs) / 3_600_000);
    const perHour = Math.round(card.currentViews / hours);
    return { perHour };
  }, [card]);
  return (
    <Sheet open={open && !!card} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent
        side="bottom"
        hideClose
        className="rounded-t-3xl h-[calc(100dvh-88px)] sm:h-auto sm:max-h-[90vh] overflow-y-auto sm:max-w-md sm:mx-auto bg-neutral-950 border-t border-white/10 p-0 focus:outline-none focus-visible:outline-none focus-visible:ring-0"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {card && (
          <>
            {/* Top bar */}
            <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-2.5 bg-neutral-950/95 backdrop-blur border-b border-white/10">
              <div className="flex-1 min-w-0 flex items-center gap-2">
                {card.starImage ? (
                  <img
                    src={card.starImage}
                    alt=""
                    className="w-5 h-5 rounded-full object-cover ring-1 ring-white/15 shrink-0"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-white/10 shrink-0" />
                )}
                <SheetTitle className="text-sm font-bold text-white truncate m-0">
                  {card.title}
                </SheetTitle>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center shrink-0"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Hero embed/thumbnail */}
            <div
              className="relative w-full bg-black overflow-hidden"
              style={{ paddingBottom: aspectToPadding(
                embed?.aspect ?? (card.source === "instagram" ? "4 / 5" : "16 / 9")
              ) }}
            >
              {embed ? (
                <iframe
                  src={embed.src}
                  title={card.title}
                  className="absolute inset-0 w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : card.source === "instagram" ? (
                <H1InstagramEmbed card={card} />
              ) : card.thumbnail ? (
                <img
                  src={card.thumbnail}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                  loading="lazy"
                />
              ) : (
                <div
                  className="absolute inset-0"
                  style={{ background: `linear-gradient(135deg, ${card.paletteA}, ${card.paletteB})` }}
                />
              )}
            </div>

            {/* Body */}
            <div className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 text-white text-xs font-semibold">
                  <Icon className="w-3.5 h-3.5" /> {label}
                </div>
                <span className="w-1 h-1 rounded-full bg-white/25" />
                <div className="flex items-center gap-1.5 min-w-0">
                  {card.starImage ? (
                    <img
                      src={card.starImage}
                      alt=""
                      className="w-4 h-4 rounded-full object-cover ring-1 ring-white/15"
                      referrerPolicy="no-referrer"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-4 h-4 rounded-full bg-white/10" />
                  )}
                  <span className="text-xs font-bold text-white/75 uppercase tracking-wide truncate">
                    {card.artist}
                  </span>
                </div>
              </div>

              <h3 className="text-lg font-medium text-white leading-snug tracking-tight mb-4">
                {card.title}
              </h3>

              {/* Prediction context — 사용자가 "이게 top 7에 들까?"를 판단할
                  때 필요한 신호 4개. Buzz=현재 절대값, Rank=24장 중 위치,
                  Velocity=시간당 증가율(per-item history 없어 평균치 근사),
                  Posted=게시 시점.
                  source별 단위가 달라서 (YT views / TT plays / IG likes /
                  Reddit·Naver는 contentScore fallback) Buzz/Velocity 절대
                  비교는 부정확 — Rank가 가장 결정적인 지표. */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="rounded-2xl bg-white/5 p-3.5">
                  <div className="text-[10px] uppercase font-bold text-white/50 mb-1 tracking-wider">Buzz</div>
                  <div className="text-xl font-black text-white tabular-nums">{formatViews(card.currentViews)}</div>
                </div>
                <div className="rounded-2xl bg-white/5 p-3.5">
                  <div className="text-[10px] uppercase font-bold text-white/50 mb-1 tracking-wider">Rank</div>
                  <div className="text-xl font-black text-white tabular-nums">
                    {rankInfo ? `#${rankInfo.rank}` : "—"}
                    {rankInfo && <span className="text-white/40 text-sm font-bold"> / {rankInfo.total}</span>}
                  </div>
                </div>
                <div className="rounded-2xl bg-white/5 p-3.5">
                  <div className="text-[10px] uppercase font-bold text-white/50 mb-1 tracking-wider">Velocity</div>
                  <div className="text-xl font-black text-white tabular-nums">
                    {velocityInfo ? `${formatViews(velocityInfo.perHour)}/h` : "—"}
                  </div>
                </div>
                <div className="rounded-2xl bg-white/5 p-3.5">
                  <div className="text-[10px] uppercase font-bold text-white/50 mb-1 tracking-wider">Posted</div>
                  <div className="text-xl font-black text-white tabular-nums">{formatAge(card.publishedAt)}</div>
                </div>
              </div>

              {card.description && (
                <p className="text-sm text-white/70 leading-relaxed mb-5 line-clamp-6 whitespace-pre-line">
                  {card.description}
                </p>
              )}

              <p className="text-[11px] text-white/40 text-center leading-relaxed">
                Browsing details counts as engagement only — vouching still requires the buttons.
              </p>

              <div className="mt-2 text-center">
                <a
                  href={card.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-white/35 hover:text-white/60 underline underline-offset-2 decoration-white/20"
                >
                  <ExternalLink className="w-3 h-3" /> View original on {label}
                </a>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/* ─────── Completion screen ─────── */
function CompletionCard({
  vouches,
  totalCards,
  onShare,
  activePicksCount,
  onUnlockMore,
  unlockRemaining,
  unlockMax,
}: {
  vouches: Record<string, Vouch>;
  totalCards: number;
  onShare: () => void;
  activePicksCount?: number;
  onUnlockMore?: () => void;
  unlockRemaining?: number;
  unlockMax?: number;
}) {
  const { t } = useLanguage();
  const vouched = Object.keys(vouches).length;
  const passed = totalCards - vouched;
  const canUnlock = !!onUnlockMore && typeof unlockRemaining === "number" && unlockRemaining > 0;
  return (
    <section className="snap-start shrink-0 h-full w-full relative bg-gradient-to-br from-rose-900 via-neutral-950 to-orange-900 flex items-center justify-center">
      <div className="text-center px-8 max-w-md">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur text-white text-xs font-bold tracking-wider uppercase mb-6">
          <Sparkles className="w-3.5 h-3.5" /> Today's calls in
        </div>
        <h2 className="text-5xl font-black text-white tracking-tight leading-[1.05] mb-6">
          You're all in.
        </h2>
        <div className="flex justify-center gap-6 mb-8 text-white">
          <Stat label="vouches" value={vouched} />
          <Stat label="passed" value={passed} />
          <Stat label="total" value={totalCards} />
        </div>
        <p className="text-white/70 text-sm leading-relaxed mb-6">
          Resolves at midnight. Share your calls now to flex when they hit —
          early callers get bragging rights.
        </p>
        <div className="flex flex-col gap-2.5 items-center">
          <button
            onClick={onShare}
            className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl bg-white text-black font-black text-sm hover:scale-[1.02] transition-transform shadow-2xl"
          >
            <Share2 className="w-4 h-4" /> Share my calls
          </button>
          {canUnlock && (
            <button
              onClick={onUnlockMore}
              className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-white/10 backdrop-blur border border-white/15 text-white text-xs font-bold hover:bg-white/15 transition-colors"
            >
              <Play className="w-3.5 h-3.5" />
              {tFmt(t("h1.adUnlock.completionCta"), {
                remaining: String(unlockRemaining ?? 0),
                max: String(unlockMax ?? 0),
              })}
            </button>
          )}
          {typeof activePicksCount === "number" && activePicksCount > 0 && (
            <CompletionActivePicksLink count={activePicksCount} />
          )}
        </div>
      </div>
    </section>
  );
}

function CompletionActivePicksLink({ count }: { count: number }) {
  const { t } = useLanguage();
  return (
    <Link
      to="/h1/history"
      className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-white/10 backdrop-blur border border-white/15 text-white text-xs font-bold hover:bg-white/15 transition-colors"
    >
      <History className="w-3.5 h-3.5" />
      {tFmt(t("h1.activePicksCta"), { n: String(count) })}
      <ChevronRight className="w-3.5 h-3.5" />
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-4xl font-black tabular-nums">{value}</div>
      <div className="text-xs opacity-70">{label}</div>
    </div>
  );
}

/* ─────── Header ─────── */
function Header({
  vouchedCount,
  quotaTarget,
  resolutionMs,
  balance,
  signedIn,
  activePicksCount,
}: {
  vouchedCount: number;
  quotaTarget: number;
  resolutionMs: number;
  balance?: number;
  signedIn?: boolean;
  activePicksCount?: number;
}) {
  const { t } = useLanguage();
  const { h, m, s } = useCountdown(resolutionMs);
  const quotaMet = vouchedCount >= quotaTarget;
  const pct = Math.min(100, (Math.min(vouchedCount, quotaTarget) / quotaTarget) * 100);
  const picksBadge = typeof activePicksCount === "number" && activePicksCount > 0 ? activePicksCount : undefined;

  return (
    <div
      className="absolute inset-x-0 top-0 z-40"
      style={{ height: HEADER_H }}
    >
      <H1AppHeader active="discover" balance={balance} signedIn={signedIn} picksBadge={picksBadge} />
      {/* /h1-only sub-strip: today's countdown + quota progress */}
      <div className="bg-black/55 backdrop-blur-xl border-b border-white/10">
        <div className="flex items-center justify-between px-4 py-1.5 max-w-[1400px] mx-auto">
          <div className="flex items-center gap-1.5 text-white">
            <span className="text-[10px] font-bold tracking-wider uppercase text-white/65">{t("h1.todaysDrop")}</span>
            <span className="text-white/30 mx-1">·</span>
            <span className="text-[11px] font-bold tabular-nums text-white/85">
              {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
            </span>
          </div>
          <div
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black tabular-nums border transition-colors ${
              quotaMet
                ? "bg-rose-500/20 text-rose-200 border-rose-400/40"
                : "bg-white/5 text-white/85 border-white/10"
            }`}
          >
            {quotaMet ? <Check className="w-2.5 h-2.5" /> : <Flame className="w-2.5 h-2.5" />}
            {Math.min(vouchedCount, quotaTarget)}/{quotaTarget}
          </div>
        </div>
        <div className="h-[2px] bg-white/5">
          <div
            className={`h-full transition-all ${
              quotaMet ? "bg-gradient-to-r from-rose-500 to-orange-400" : "bg-white/40"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

/* ─────── Bottom nav ─────── */
type H1NavTab = "discover" | "history" | "leaderboard" | "pro";

function BottomNav({
  activePicksCount = 0,
  active = "discover",
  position = "absolute",
}: {
  activePicksCount?: number;
  active?: H1NavTab;
  position?: "absolute" | "fixed";   // /h1 uses absolute (inside snap container); other pages use fixed
}) {
  const { t } = useLanguage();
  return (
    <nav
      className={cn(
        "inset-x-0 z-40 bg-black/65 backdrop-blur-xl border-t border-white/10",
        position === "fixed" ? "fixed bottom-0" : "absolute bottom-0",
      )}
      style={{ height: BOTTOM_NAV_H, paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="grid grid-cols-4 h-full px-2">
        <NavBtn icon={Flame}   label={t("h1.nav.discover")}    to="/h1"             active={active === "discover"} />
        <NavBtn icon={History} label={t("h1.nav.myCalls")}     to="/h1/history"     active={active === "history"} badge={activePicksCount} />
        <NavBtn icon={Trophy}  label={t("h1.nav.leaderboard")} to="/h1/leaderboard" active={active === "leaderboard"} />
        <NavBtn icon={Zap}     label={t("h1.nav.pro")}         to="/pro"            active={active === "pro"} />
      </div>
    </nav>
  );
}

export { BottomNav };
export type { H1NavTab };

function NavBtn({
  icon: Icon,
  label,
  to,
  active = false,
  badge,
}: {
  icon: React.ElementType;
  label: string;
  to: string;
  active?: boolean;
  badge?: number;
}) {
  return (
    <Link
      to={to}
      className={`relative flex flex-col items-center justify-center gap-0.5 transition-colors ${
        active ? "text-white" : "text-white/45 hover:text-white/80"
      }`}
    >
      <div className="relative">
        <Icon className={`w-5 h-5 ${active ? "fill-white/15" : ""}`} strokeWidth={active ? 2.5 : 2} />
        {typeof badge === "number" && badge > 0 && (
          <span className="absolute -top-1 -right-2 min-w-[15px] h-[15px] px-1 rounded-full bg-violet-500 text-white text-[9px] font-black tabular-nums grid place-items-center shadow-md ring-2 ring-black/65">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </div>
      <span className="text-[9.5px] font-bold tracking-tight">{label}</span>
    </Link>
  );
}

/* ════════════════════════════════════════
   DESKTOP LAYOUT
   ════════════════════════════════════════ */

// Count of user's active (unresolved) picks across all open rounds, excluding
// today's drop. Used to badge the History nav slot — surfaces "you have N
// pending picks to check" without dominating today's drop ritual.
function useActivePicksCount(userId: string | undefined) {
  return useQuery({
    queryKey: ["h1-active-picks-count", userId],
    queryFn: async (): Promise<number> => {
      if (!userId) return 0;
      const { data, error } = await (supabase as any).rpc("ktrenz_h1_my_active_picks");
      if (error) {
        console.warn("[h1] active_picks fetch failed:", error.message);
        return 0;
      }
      const today = new Date().toISOString().slice(0, 10);
      return (data ?? []).filter((r: any) => r.drop_date !== today).length;
    },
    enabled: !!userId,
    staleTime: 1000 * 60,
  });
}

// Top 3 from the most recently resolved daily leaderboard. Empty until
// the first cohort settles (7d after first curate run).
type LeaderboardPreviewRow = { user_id: string; total_score: number; hits: number; rank: number };
function useTopLeaderboardPreview() {
  return useQuery({
    queryKey: ["h1-leaderboard-preview"],
    queryFn: async (): Promise<LeaderboardPreviewRow[]> => {
      const { data: dates } = await (supabase as any)
        .from("ktrenz_h1_leaderboard_daily")
        .select("drop_date")
        .order("drop_date", { ascending: false })
        .limit(1);
      const latest = dates?.[0]?.drop_date as string | undefined;
      if (!latest) return [];
      const { data } = await (supabase as any)
        .from("ktrenz_h1_leaderboard_daily")
        .select("user_id, total_score, hits, rank")
        .eq("drop_date", latest)
        .order("rank", { ascending: true })
        .limit(3);
      return (data ?? []) as LeaderboardPreviewRow[];
    },
    staleTime: 1000 * 60 * 5,
  });
}

function LeaderboardPreview() {
  const { data: rows = [] } = useTopLeaderboardPreview();
  return (
    <div className="rounded-xl bg-white/[0.04] border border-white/10 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-white/60">
          Top Recently
        </span>
        <Link to="/h1/leaderboard" className="text-[10px] text-white/40 hover:text-white/70 inline-flex items-center gap-0.5">
          View all <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="text-[11px] text-white/40 leading-relaxed">
          No resolved drops yet. First cohort settles 7 days after launch.
        </p>
      ) : (
        <ol className="space-y-2.5">
          {rows.map((u, i) => (
            <li key={u.user_id} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-5 h-5 rounded-full grid place-items-center text-[10px] font-black ${
                  i === 0 ? "bg-amber-500/20 text-amber-300" :
                  i === 1 ? "bg-zinc-400/20 text-zinc-300" :
                  "bg-orange-500/15 text-orange-300"
                }`}>
                  {u.rank}
                </span>
                <span className="text-xs text-white truncate font-medium">
                  Caller-{u.user_id.slice(-4).toUpperCase()}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px] tabular-nums">
                <span className="text-white/60">{u.hits}h</span>
                <span className="font-black text-white">{Math.round(u.total_score)}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function DesktopHeader({
  vouchedCount,
  quotaTarget,
  resolutionMs,
  balance,
  signedIn,
  activePicksCount,
}: {
  vouchedCount: number;
  quotaTarget: number;
  resolutionMs: number;
  balance?: number;
  signedIn?: boolean;
  activePicksCount?: number;
}) {
  const { t } = useLanguage();
  const { h, m, s } = useCountdown(resolutionMs);
  const quotaMet = vouchedCount >= quotaTarget;
  const picksBadge = typeof activePicksCount === "number" && activePicksCount > 0 ? activePicksCount : undefined;

  return (
    <>
      <H1AppHeader active="discover" balance={balance} signedIn={signedIn} picksBadge={picksBadge} />
      {/* /h1-only sub-strip on desktop: today's countdown + quota chip */}
      <div className="bg-black/55 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-3 px-6 py-1.5">
          <div className="inline-flex items-center gap-1.5 text-white/85 text-xs font-medium">
            <span className="text-[10px] tracking-wider uppercase font-bold text-white/65">{t("h1.todaysDrop")}</span>
            <span className="text-white/30 mx-1">·</span>
            <span className="font-bold tabular-nums">
              {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
            </span>
          </div>
          <div
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black tabular-nums border transition-colors ${
              quotaMet
                ? "bg-rose-500/20 text-rose-200 border-rose-400/40"
                : "bg-white/5 text-white/85 border-white/10"
            }`}
          >
            {quotaMet ? <Check className="w-3 h-3" /> : <Flame className="w-3 h-3" />}
            {Math.min(vouchedCount, quotaTarget)}/{quotaTarget}
          </div>
        </div>
      </div>
    </>
  );
}

function DesktopSidebar({
  vouchedCount,
  quotaTarget = DAILY_QUOTA_TARGET_MAX,
  activePicksCount,
  active = "discover",
  showQuota = true,
}: {
  vouchedCount?: number;
  quotaTarget?: number;
  activePicksCount?: number;
  active?: H1NavTab;
  showQuota?: boolean;
}) {
  const { t } = useLanguage();
  const vc = vouchedCount ?? 0;
  const quotaMet = vc >= quotaTarget;
  const displayed = Math.min(vc, quotaTarget);
  const pct = Math.min(100, (displayed / quotaTarget) * 100);
  const picksBadge = typeof activePicksCount === "number" && activePicksCount > 0 ? activePicksCount : undefined;

  return (
    <aside className="hidden lg:flex flex-col w-64 shrink-0 sticky top-16 h-[calc(100vh-4rem)] border-r border-white/10 px-4 py-6 gap-5 overflow-y-auto scrollbar-hide">
      {/* Nav */}
      <nav className="flex flex-col gap-0.5">
        <SidebarNavItem icon={Flame}   label={t("h1.nav.discover")}    to="/h1"             active={active === "discover"} />
        <SidebarNavItem icon={History} label={t("h1.nav.myCalls")}     to="/h1/history"     active={active === "history"} badge={picksBadge} />
        <SidebarNavItem icon={Trophy}  label={t("h1.nav.leaderboard")} to="/h1/leaderboard" active={active === "leaderboard"} />
        <SidebarNavItem icon={Users}   label={t("h1.nav.squads")}      hint={t("h1.nav.soon")} disabled />
      </nav>

      {/* Quota card — only on /h1 (Discover) */}
      {showQuota && (
        <div className="rounded-xl bg-white/[0.04] border border-white/10 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-white/60">
              Today's Quota
            </span>
            {quotaMet && (
              <span className="inline-flex items-center gap-1 text-[10px] font-black text-rose-300 uppercase tracking-wider">
                <Check className="w-2.5 h-2.5" /> Met
              </span>
            )}
          </div>
          <div className="text-3xl font-black text-white tabular-nums mb-2">
            {displayed}<span className="text-white/40 text-xl">/{quotaTarget}</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mb-3">
            <div
              className={`h-full transition-all ${
                quotaMet ? "bg-gradient-to-r from-rose-500 to-orange-400" : "bg-white/40"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-[11px] text-white/50 leading-relaxed">
            {quotaMet
              ? "Daily slots used. Edit existing picks any time before resolution."
              : `${quotaTarget - vc} more action${quotaTarget - vc === 1 ? "" : "s"} to qualify for the leaderboard.`}
          </p>
        </div>
      )}

      <LeaderboardPreview />

    </aside>
  );
}

export { DesktopSidebar };
export { useActivePicksCount };

function SidebarNavItem({
  icon: Icon,
  label,
  to,
  active = false,
  hint,
  badge,
  disabled = false,
}: {
  icon: React.ElementType;
  label: string;
  to?: string;
  active?: boolean;
  hint?: string;
  badge?: number;
  disabled?: boolean;
}) {
  const cls = `flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
    active
      ? "bg-white/10 text-white"
      : disabled
        ? "text-white/20 cursor-not-allowed"
        : "text-white/60 hover:text-white hover:bg-white/5"
  }`;
  const inner = (
    <>
      <span className="flex items-center gap-2.5">
        <Icon className="w-4 h-4" strokeWidth={active ? 2.5 : 2} />
        {label}
      </span>
      {typeof badge === "number" && badge > 0 ? (
        <span className="min-w-[20px] h-[20px] px-1.5 rounded-full bg-violet-500 text-white text-[10px] font-black tabular-nums grid place-items-center">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : hint ? (
        <span className="text-[10px] font-medium text-white/40 uppercase tracking-wider">{hint}</span>
      ) : null}
    </>
  );
  if (disabled || !to) {
    return <button disabled={disabled} className={cls}>{inner}</button>;
  }
  return <Link to={to} className={cls}>{inner}</Link>;
}

/* ─────── Desktop card (compact, inline vouch) ─────── */
function DesktopCard({
  card,
  vouch,
  onVouch,
  onOpenDetail,
  onOpenHelp,
  slotState,
}: {
  card: DiscoverCard;
  vouch: Vouch | undefined;
  onVouch: (v: Vouch) => void;
  onOpenDetail: () => void;
  onOpenHelp: () => void;
  slotState?: SlotState;
}) {
  const { t } = useLanguage();
  const { Icon, label } = sourceMeta(card.source);
  const decided = !!vouch;

  return (
    <article
      className={`group relative rounded-2xl overflow-hidden bg-neutral-950 transition-all hover:-translate-y-0.5 ${
        decided
          ? "border-2 border-violet-400/70 shadow-[0_0_28px_rgba(167,139,250,0.22)]"
          : "border border-white/10 hover:border-white/25 hover:shadow-[0_20px_40px_rgba(0,0,0,0.5)]"
      }`}
    >
      {/* ── Section 1: Image ── */}
      <button
        type="button"
        onClick={onOpenDetail}
        className="block w-full aspect-[4/3] relative text-left bg-neutral-900"
      >
        <ImagePlate card={card} />

        {/* Top chips */}
        <div className="absolute top-2.5 inset-x-2.5 z-20 flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/65 backdrop-blur-md border border-white/15 text-white text-[10px] font-semibold">
            <Icon className="w-2.5 h-2.5" /> {label}
          </div>
          <div className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-black/65 backdrop-blur-md border border-white/15 text-white/85 text-[10px] font-medium">
            <Clock className="w-2.5 h-2.5" /> {hoursAgo(card.publishedAt)}h
          </div>
        </div>

        {decided && (
          <div className="absolute top-2.5 left-1/2 -translate-x-1/2 z-30 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-violet-500 to-purple-600 text-white text-[10px] font-black uppercase tracking-wider shadow-lg">
            <Check className="w-2.5 h-2.5" strokeWidth={3} /> {t("h1.called")} ×{VOUCH_META[vouch as Vouch].mult}
          </div>
        )}
      </button>

      {/* ── Section 2: Title block ── */}
      <button
        type="button"
        onClick={onOpenDetail}
        className="block w-full text-left px-4 pt-3.5 pb-3 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2 mb-1.5">
          {card.starImage ? (
            <img
              src={card.starImage}
              alt=""
              className="w-4 h-4 rounded-full object-cover ring-1 ring-white/10"
              referrerPolicy="no-referrer"
              loading="lazy"
            />
          ) : (
            <div className="w-4 h-4 rounded-full bg-white/10" />
          )}
          <span className="text-[11px] font-semibold text-white/65 uppercase tracking-wide truncate">
            {card.artist}
          </span>
        </div>
        <h3 className="text-sm font-medium text-white leading-[1.35] tracking-tight line-clamp-2 mb-2 min-h-[2.4em]">
          {card.title}
        </h3>
      </button>

      {/* ── Section 3: Vouch row ── */}
      <div className="px-4 pb-3.5 pt-2 border-t border-white/5">
        {!decided ? (
          <>
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div className="flex flex-col gap-px">
                <span className="text-[12px] font-black text-white tracking-tight">
                  {t("h1.willGoViralShort")}
                </span>
                <span className="text-[10px] text-white/50 font-medium">
                  {t("h1.callStrengthPrompt")}
                </span>
              </div>
              <button
                onClick={onOpenHelp}
                className="text-white/40 hover:text-white/80 transition-colors shrink-0"
                aria-label={t("h1.howItWorks")}
              >
                <HelpCircle className="w-3 h-3" />
              </button>
            </div>
            <div className="flex gap-1.5">
              <DesktopVouchBtn level="low"  active={false} onClick={() => onVouch("low")}  disabled={slotState?.low.disabled} />
              <DesktopVouchBtn level="mid"  active={false} onClick={() => onVouch("mid")}  disabled={slotState?.mid.disabled} />
              <DesktopVouchBtn level="high" active={false} onClick={() => onVouch("high")} disabled={slotState?.high.disabled} />
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-white/[0.03] border border-white/10">
            <div className="inline-flex items-center gap-2 min-w-0">
              <div className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br shadow-sm shrink-0",
                VOUCH_META[vouch].shade,
              )}>
                {(() => { const VI = VOUCH_META[vouch].icon; return <VI className="w-4 h-4 text-white" strokeWidth={2.5} />; })()}
              </div>
              <div className="flex flex-col leading-none min-w-0">
                <span className="text-[9px] font-black text-white/55 uppercase tracking-[0.15em]">{t("h1.called")}</span>
                <span className="font-black text-white tabular-nums text-base mt-0.5">×{VOUCH_META[vouch].mult}</span>
              </div>
            </div>
            <div className="flex gap-1 shrink-0">
              {(["low", "mid", "high"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => onVouch(l)}
                  title={`×${VOUCH_META[l].mult}`}
                  className={cn(
                    "px-2 py-1 rounded-md text-[10px] font-black tabular-nums transition-all border",
                    vouch === l
                      ? "bg-white/15 text-white border-white/25"
                      : "border-transparent text-white/45 hover:text-white/80 hover:bg-white/5",
                  )}
                >
                  ×{VOUCH_META[l].mult}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function DesktopVouchBtn({
  level,
  active,
  onClick,
  disabled,
}: {
  level: "low" | "mid" | "high";
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  const { t } = useLanguage();
  const c = VOUCH_META[level];
  const Icon = c.icon;
  return (
    <button
      onClick={onClick}
      disabled={disabled && !active}
      className={cn(
        "relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 rounded-xl text-xs font-black tracking-tight transition-all border active:scale-95",
        active
          ? `bg-gradient-to-b ${c.shade} text-white shadow-lg ${c.glow} border-white/25 ring-1 ${c.ring}`
          : disabled
            ? "bg-white/[0.02] text-white/30 border-white/5 cursor-not-allowed"
            : "bg-white/[0.04] text-white/80 border-white/10 hover:bg-white/[0.08] hover:border-white/20 hover:text-white",
      )}
    >
      <Icon className="w-3 h-3 mb-0.5" strokeWidth={active ? 2.5 : 2} />
      <span className="text-[15px] font-black tabular-nums leading-none">×{c.mult}</span>
    </button>
  );
}

/* ─────── Desktop shell ─────── */
function DesktopShell({
  cards,
  isLoading,
  vouches,
  vouchedCount,
  quotaTarget,
  resolutionAtMs,
  detail,
  setDetail,
  handleVouch,
  handleShare,
  onOpenHelp,
  slotState,
  h1Status,
  activePicksCount,
  onUnlockMore,
  unlockRemaining,
  unlockMax,
}: {
  cards: DiscoverCard[];
  isLoading: boolean;
  vouches: Record<string, Vouch>;
  vouchedCount: number;
  quotaTarget: number;
  resolutionAtMs: number;
  detail: DiscoverCard | null;
  setDetail: (c: DiscoverCard | null) => void;
  handleVouch: (cardId: string, v: Vouch) => void;
  handleShare: () => void;
  onOpenHelp: () => void;
  slotState: SlotState;
  h1Status: { signed_in: boolean; balance: number };
  activePicksCount?: number;
  onUnlockMore?: () => void;
  unlockRemaining?: number;
  unlockMax?: number;
}) {
  const { t } = useLanguage();
  const allDecided = cards.length > 0 && vouchedCount >= cards.length;

  return (
    <div className="min-h-screen bg-neutral-950 text-white relative">
      {/* Ambient brand backdrop (subtle) */}
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
        <div className="absolute -top-1/3 -left-1/4 w-[60vw] h-[60vh] rounded-full blur-[200px] opacity-20 bg-rose-600" />
        <div className="absolute -bottom-1/3 -right-1/4 w-[60vw] h-[60vh] rounded-full blur-[200px] opacity-15 bg-orange-500" />
      </div>

      <DesktopHeader vouchedCount={vouchedCount} quotaTarget={quotaTarget} resolutionMs={resolutionAtMs} balance={h1Status.balance} signedIn={h1Status.signed_in} activePicksCount={activePicksCount} />

      <div className="max-w-[1400px] mx-auto flex">
        <DesktopSidebar vouchedCount={vouchedCount} quotaTarget={quotaTarget} activePicksCount={activePicksCount} active="discover" showQuota />

        <main className="flex-1 px-5 lg:px-8 py-8 min-w-0">
          {/* Page heading */}
          <div className="mb-7">
            <div className="inline-flex items-center px-2.5 py-1 rounded-full bg-rose-500/15 border border-rose-400/25 text-rose-300 text-[10px] font-black tracking-[0.18em] uppercase mb-3">
              Today's Drop
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white mb-2">
              Which K-pop content blows up next?
            </h1>
            <p className="text-sm text-white/55 max-w-2xl">
              {isLoading ? "Loading today's drop…" : `${cards.length} curated picks resolve at midnight. Earlier calls earn more — vouch confidence (Low / Mid / High) sets your reward weight.`}
            </p>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5 lg:gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="aspect-[4/5] rounded-2xl bg-white/5 border border-white/10 animate-pulse" />
              ))}
            </div>
          ) : cards.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5 lg:gap-6">
              {cards.map((card) => (
                <DesktopCard
                  key={card.id}
                  card={card}
                  vouch={vouches[card.id]}
                  onVouch={(v) => handleVouch(card.id, v)}
                  onOpenDetail={() => setDetail(card)}
                  onOpenHelp={onOpenHelp}
                  slotState={slotState}
                />
              ))}
            </div>
          )}

          {/* Completion CTA */}
          {allDecided && (
            <div className="mt-8 rounded-2xl bg-gradient-to-r from-rose-900/40 via-neutral-900 to-orange-900/40 border border-rose-500/20 p-6 text-center">
              <div className="text-3xl mb-2">🔥</div>
              <h3 className="text-xl font-black text-white mb-1">All {cards.length} calls in</h3>
              <p className="text-sm text-white/60 mb-4">
                Resolves at midnight. Share your card to flex when they hit.
              </p>
              <div className="inline-flex flex-wrap items-center justify-center gap-2.5">
                <button
                  onClick={handleShare}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white text-black font-black text-sm hover:scale-[1.02] transition-transform shadow-2xl"
                >
                  <Share2 className="w-4 h-4" /> Share my calls
                </button>
                {onUnlockMore && typeof unlockRemaining === "number" && unlockRemaining > 0 && (
                  <button
                    onClick={onUnlockMore}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/10 backdrop-blur border border-white/15 text-white text-xs font-bold hover:bg-white/15 transition-colors"
                  >
                    <Play className="w-3.5 h-3.5" />
                    {tFmt(t("h1.adUnlock.completionCta"), {
                      remaining: String(unlockRemaining),
                      max: String(unlockMax ?? 0),
                    })}
                  </button>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      <DetailDrawer card={detail} cards={cards} open={!!detail} onClose={() => setDetail(null)} />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
      <Sparkles className="w-8 h-8 text-white/40 mx-auto mb-3" />
      <h3 className="text-lg font-bold text-white mb-1">No drop available yet</h3>
      <p className="text-sm text-white/50">
        We're curating today's content. Check back in a few minutes.
      </p>
    </div>
  );
}

/* ════════════════════════════════════════
   MOBILE SHELL
   ════════════════════════════════════════ */
function MobileShell({
  cards,
  isLoading,
  vouches,
  vouchedCount,
  quotaTarget,
  resolutionAtMs,
  detail,
  setDetail,
  handleVouch,
  handleShare,
  onOpenHelp,
  slotState,
  h1Status,
  activePicksCount,
  onUnlockMore,
  unlockRemaining,
  unlockMax,
}: {
  activePicksCount?: number;
  cards: DiscoverCard[];
  isLoading: boolean;
  vouches: Record<string, Vouch>;
  vouchedCount: number;
  quotaTarget: number;
  resolutionAtMs: number;
  detail: DiscoverCard | null;
  setDetail: (c: DiscoverCard | null) => void;
  slotState: SlotState;
  h1Status: { signed_in: boolean; balance: number };
  handleVouch: (cardId: string, v: Vouch) => void;
  handleShare: () => void;
  onOpenHelp: () => void;
  onUnlockMore?: () => void;
  unlockRemaining?: number;
  unlockMax?: number;
}) {
  const feedRef = useRef<HTMLDivElement>(null);

  function scrollNext(currentId: string) {
    const el = feedRef.current;
    if (!el) return;
    const idx = cards.findIndex((c) => c.id === currentId);
    const next = el.children[idx + 1] as HTMLElement | undefined;
    if (next) next.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="relative bg-black overflow-hidden w-full h-[100dvh]">
      <Header vouchedCount={vouchedCount} quotaTarget={quotaTarget} resolutionMs={resolutionAtMs} balance={h1Status.balance} signedIn={h1Status.signed_in} activePicksCount={activePicksCount} />

      {isLoading ? (
        <div className="absolute inset-0 flex items-center justify-center text-white/60">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : cards.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center px-8 text-center">
          <div>
            <Sparkles className="w-8 h-8 text-white/40 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-white mb-1">No drop available yet</h3>
            <p className="text-sm text-white/50">Check back in a few minutes.</p>
          </div>
        </div>
      ) : (
        <div
          ref={feedRef}
          className="absolute inset-0 overflow-y-auto snap-y snap-mandatory scrollbar-hide"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {cards.map((card) => (
            <ContentCardFull
              key={card.id}
              card={card}
              vouch={vouches[card.id]}
              onVouch={(v) => handleVouch(card.id, v)}
              onOpenDetail={() => setDetail(card)}
              onScrollNext={() => scrollNext(card.id)}
              onOpenHelp={onOpenHelp}
              slotState={slotState}
            />
          ))}
          <CompletionCard
            vouches={vouches}
            totalCards={cards.length}
            onShare={handleShare}
            activePicksCount={activePicksCount}
            onUnlockMore={onUnlockMore}
            unlockRemaining={unlockRemaining}
            unlockMax={unlockMax}
          />
        </div>
      )}

      <BottomNav activePicksCount={activePicksCount} />

      <DetailDrawer card={detail} cards={cards} open={!!detail} onClose={() => setDetail(null)} />
    </div>
  );
}

/* ════════════════════════════════════════
   PAGE
   ════════════════════════════════════════ */
export default function H1Discover() {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const onDripGranted = useCallback((amount: number) => {
    toast({
      title: tFmt(t("h1.toast.dripGranted"), { amount: String(amount) }),
    });
  }, [t, toast]);
  const { status: h1Status, refetch: refetchStatus, canCall } = useH1Status(user?.id, onDripGranted);
  const { data: cards = [], isLoading } = useDiscoverCards();
  const { data: activePicksCount = 0 } = useActivePicksCount(user?.id);

  const resolutionAtMs = useMemo(() => {
    const next = new Date();
    next.setHours(24, 0, 0, 0);
    return next.getTime();
  }, []);

  // Initial state: load whatever was last saved for the current owner
  // (authed user uuid or "anon"). The auth-change effect below re-loads
  // when user.id flips.
  const [vouches, setVouches] = useState<Record<string, Vouch>>(() => loadVouches(user?.id));
  // Tracks which owner the current in-memory `vouches` belongs to. Used by
  // the save effect to skip writes during the brief window where user.id
  // has changed but the auth-change effect hasn't yet reloaded state —
  // otherwise the prior user's vouches get flushed into the new owner's
  // localStorage bucket.
  const vouchesOwnerRef = useRef<string | null>(user?.id ?? null);
  const [detail, setDetail] = useState<DiscoverCard | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [loginNudgeOpen, setLoginNudgeOpen] = useState<false | "share" | "quota">(false);
  const [pendingCall, setPendingCall] = useState<{ cardId: string; tier: Vouch } | null>(null);
  const [adUnlockOpen, setAdUnlockOpen] = useState(false);
  const lastSyncedUserRef = useRef<string | null>(null);
  const quotaNudgedRef = useRef(false);
  const helpAutoTriggerRef = useRef(false);

  // First-visit help: pop the modal once so the cold UA isn't dropped onto
  // unexplained cards. Sticky via localStorage so returning users don't get
  // re-onboarded; clearing storage re-arms it (acceptable for v1).
  useEffect(() => {
    try {
      if (localStorage.getItem("ktrenz-h1-help-seen")) return;
    } catch { return; }
    const t = setTimeout(() => {
      helpAutoTriggerRef.current = true;
      setHelpOpen(true);
      trackH1Event("h1_help_opened", { trigger: "first_visit" });
    }, 600);
    return () => clearTimeout(t);
  }, []);

  const closeHelp = () => {
    setHelpOpen(false);
    try { localStorage.setItem("ktrenz-h1-help-seen", "1"); } catch { /* ignore */ }
    trackH1Event("h1_help_dismissed", {
      trigger: helpAutoTriggerRef.current ? "first_visit" : "manual",
    });
    helpAutoTriggerRef.current = false;
  };
  const openHelp = () => {
    helpAutoTriggerRef.current = false;
    setHelpOpen(true);
    trackH1Event("h1_help_opened", { trigger: "manual" });
  };

  // Persist vouches to localStorage. Gated on ownerRef matching the current
  // user — otherwise a logout/account-switch flush could write the prior
  // session's data into the new owner's bucket.
  useEffect(() => {
    const currentOwner = user?.id ?? null;
    if (vouchesOwnerRef.current !== currentOwner) return;
    saveVouches(currentOwner, vouches);
  }, [vouches, user?.id]);

  // Page-view telemetry (fires once per session per refresh).
  useEffect(() => {
    trackH1Event("h1_page_view", { page: "discover" });
    // Prefetch sibling H1 page chunks + Settings (reachable from profile
    // menu) so nav doesn't trigger the Suspense fallback flicker.
    void import("./H1History");
    void import("./H1Leaderboard");
    void import("./Settings");
  }, []);

  // Auth change handler:
  //   - logout (user.id → undefined): clear in-memory state to anon's storage
  //   - login change (different user.id): swap state to the new user's
  //     storage, run anon→authed migration once per user, hydrate from server
  //
  // Without this every previous-session's vouch persisted across logout/
  // login, including cross-account leakage via the legacy single-key
  // localStorage scheme.
  useEffect(() => {
    const ownerId = user?.id ?? null;
    // Update the owner ref BEFORE setVouches so the save effect (which
    // depends on the same user.id) sees the aligned state on the next tick.
    vouchesOwnerRef.current = ownerId;
    // Reset in-memory state to whatever this owner has stored.
    setVouches(loadVouches(ownerId));

    // Anon-only or unchanged user: nothing more to do.
    if (!ownerId) {
      lastSyncedUserRef.current = null;
      return;
    }
    if (lastSyncedUserRef.current === ownerId) return;
    lastSyncedUserRef.current = ownerId;

    let cancelled = false;
    (async () => {
      // 1. One-time anon→authed migration: if the previous-session anon
      // localStorage has vouches, push them to the server, then clear that
      // anon bucket so a future logout doesn't re-leak across accounts.
      const anonLocal = loadVouches(null);
      const anonEntries = Object.entries(anonLocal);
      if (anonEntries.length > 0) {
        await Promise.all(anonEntries.map(([itemId, conf]) =>
          (supabase as any).rpc("ktrenz_h1_record_vouch", {
            _item_id: itemId,
            _confidence: conf,
          }),
        ));
        clearVouches(null);
        trackH1Event("h1_localstorage_synced", { count: anonEntries.length });
      }

      // 2. Pull this user's server state and use it as the canonical source
      // (replace, don't merge — cross-user state should never linger).
      const { data, error } = await (supabase as any).rpc("ktrenz_h1_my_today_vouches");
      if (cancelled || error || !Array.isArray(data)) return;
      const next: Record<string, Vouch> = {};
      for (const row of data as Array<{ item_id: string; confidence: Vouch }>) {
        if (row?.item_id && row?.confidence) next[row.item_id] = row.confidence;
      }
      setVouches(next);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const vouchedCount = Object.keys(vouches).length;

  // Two-stage flow:
  //   requestVouch — user tapped a tier; pre-validate (slot/balance), then open
  //                  confirm dialog so user sees concrete payout/loss before
  //                  spending K-Cash.
  //   handleVouch — actual write to local state + server, called from the
  //                 dialog's confirm handler (or directly when re-tapping the
  //                 already-active tier on a card).
  function requestVouch(cardId: string, v: Vouch) {
    // Re-tapping the same tier toggles to itself — skip dialog.
    if (vouches[cardId] === v) return;
    if (user?.id) {
      const gate = canCall(v as ConfidenceTier);
      if (!gate.ok) {
        const cap = h1Status.slots[v as ConfidenceTier].cap;
        const slotFull = gate.reason === "slot_full";
        const adUnlocksLeft = Math.max(0, (h1Status.ad_unlocks?.max_per_day ?? 0) - (h1Status.ad_unlocks?.used ?? 0));
        const canOfferAd = slotFull && (v === "mid" || v === "high") && adUnlocksLeft > 0;
        toast({
          variant: "destructive",
          title: slotFull
            ? tFmt(t("h1.toast.slotFullTitle"), { tier: `×${VOUCH_META[v].mult}` })
            : t("h1.toast.lowBalanceTitle"),
          description: slotFull
            ? tFmt(t("h1.toast.slotFullBody"), { tier: `×${VOUCH_META[v].mult}`, cap: String(cap) })
            : t("h1.toast.lowBalanceBody"),
          action: canOfferAd
            ? (
                <ToastAction
                  altText={t("h1.adUnlock.toastAction")}
                  onClick={() => {
                    trackH1Event("h1_ad_unlock_open", { trigger: "slot_full", tier: v });
                    setAdUnlockOpen(true);
                  }}
                >
                  {t("h1.adUnlock.toastAction")}
                </ToastAction>
              )
            : undefined,
        });
        return;
      }
    }
    setPendingCall({ cardId, tier: v });
  }

  function handleVouch(cardId: string, v: Vouch) {
    const wasNew = !vouches[cardId];
    // Gating already done in requestVouch. Server is the authoritative gate;
    // a race here just causes a rollback in the response handler below.
    // Optimistic local update — UI never waits for the server round-trip.
    setVouches((prev) => ({ ...prev, [cardId]: v }));
    trackH1Event("h1_vouch", { item_id: cardId, confidence: v, was_new: wasNew, authed: !!user?.id });
    // Fire-and-forget server persist when authed. Failures keep the local
    // state intact so the user doesn't lose their pick if the network blips.
    if (user?.id) {
      void (supabase as any)
        .rpc("ktrenz_h1_record_vouch", { _item_id: cardId, _confidence: v })
        .then(({ error }: { error: unknown }) => {
          if (error) {
            console.warn("[h1] record_vouch failed:", error);
            // Server rejected (likely a race vs another tab). Roll back the
            // optimistic update so the UI doesn't lie.
            const errMsg = String((error as any)?.message ?? "");
            if (errMsg.includes("SLOT_CAP_EXCEEDED") || errMsg.includes("INSUFFICIENT_BALANCE")) {
              setVouches((prev) => {
                const next = { ...prev };
                delete next[cardId];
                return next;
              });
              toast({
                variant: "destructive",
                title: t("h1.toast.raceTitle"),
                description: t("h1.toast.raceBody"),
              });
            }
          }
          // Always refresh status so slot counters/balance stay live.
          void refetchStatus();
        });
    } else if (wasNew) {
      // Quota-cross nudge: anon user just hit the qualifying threshold.
      // Fire once per session so we don't keep nagging on every vouch.
      const nextCount = vouchedCount + 1;
      if (nextCount >= quotaTargetFor(cards.length) && !quotaNudgedRef.current) {
        quotaNudgedRef.current = true;
        setLoginNudgeOpen("quota");
        trackH1Event("h1_login_nudge_shown", { trigger: "quota" });
      }
    }
  }

  async function handleShare() {
    if (vouchedCount === 0) return;
    // Block anon share at the artifact step — the slate exists forever and
    // attaching it to a real account is much more valuable for both the
    // user (history, K-Cash) and the funnel (referral attribution later).
    if (!user?.id) {
      setLoginNudgeOpen("share");
      trackH1Event("h1_login_nudge_shown", { trigger: "share" });
      return;
    }
    // Build the snapshot — denormalized so the share survives item changes.
    const snapshot = cards
      .filter((c) => vouches[c.id])
      .map((c) => ({
        item_id: c.id,
        confidence: vouches[c.id],
        title: c.title,
        artist: c.artist,
        thumbnail: c.thumbnail,
        source: c.source,
      }));

    // Persist a public slate row and pivot the share URL to it.
    let slateUrl = `${window.location.origin}/h1`;
    try {
      const { data, error } = await (supabase as any).rpc("ktrenz_h1_create_shared_slate", {
        _vouches: snapshot,
        _handle: null,
      });
      if (!error && data?.slate_id) {
        slateUrl = `${window.location.origin}/h1/share/${data.slate_id}`;
        trackH1Event("h1_share_created", { slate_id: data.slate_id, vouches: vouchedCount });
      } else if (error) {
        console.warn("[h1] create_shared_slate failed, sharing default URL:", error);
      }
    } catch (err) {
      console.warn("[h1] create_shared_slate threw:", err);
    }

    const shareText = `I called ${vouchedCount} K-pop contents today on KTrenZ. Watch them blow up.`;
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({
        title: "My K-pop calls today",
        text: shareText,
        url: slateUrl,
      }).catch(() => { /* user cancelled */ });
    } else if (typeof navigator !== "undefined" && navigator.clipboard) {
      // Desktop fallback: copy to clipboard.
      void navigator.clipboard.writeText(`${shareText} ${slateUrl}`);
    }
  }

  // Slot state — computed from local vouches (optimistic) so disabled flips
  // immediately on swap, without waiting for refetch. h1Status supplies caps.
  const slotState = useMemo(() => {
    let used: Record<Vouch, number> = { low: 0, mid: 0, high: 0 };
    for (const v of Object.values(vouches)) {
      if (v === "low" || v === "mid" || v === "high") used[v] += 1;
    }
    const computeOne = (tier: Vouch) => {
      const cap = h1Status.slots[tier].cap;
      const remaining = Math.max(0, cap - used[tier]);
      const balanceBlocked = tier !== "low" && h1Status.signed_in && h1Status.balance <= 0;
      // Don't disable for anon — they can vouch via localStorage; rules apply on login flip.
      const disabled = h1Status.signed_in && (remaining === 0 || balanceBlocked);
      return { remaining, disabled };
    };
    return { low: computeOne("low"), mid: computeOne("mid"), high: computeOne("high") };
  }, [vouches, h1Status]);

  // Ad-unlock CTA: only offer to authed users with remaining unlock budget
  // AND remaining unvouched cards. If user already vouched everything, the
  // ad watch is wasted — gate to `cards.length - vouchedCount` so cohorts
  // smaller than the server cap don't strand unlocks.
  const adUnlocks = h1Status.ad_unlocks ?? { used: 0, max_per_day: 5, mid: 0, high: 0 };
  const unlockServerRemaining = Math.max(0, adUnlocks.max_per_day - adUnlocks.used);
  const unvouchedRemaining = Math.max(0, cards.length - vouchedCount);
  const unlockRemaining = Math.min(unlockServerRemaining, unvouchedRemaining);
  const onUnlockMore = h1Status.signed_in && unlockRemaining > 0
    ? () => {
        trackH1Event("h1_ad_unlock_open", { remaining: unlockRemaining });
        setAdUnlockOpen(true);
      }
    : undefined;

  // Quota target scales with today's cohort size (cards.length). Falls back
  // to the max when cards haven't loaded yet so the empty-state nudge copy
  // isn't a misleading "0/0".
  const quotaTarget = quotaTargetFor(cards.length);

  const shared = {
    cards,
    isLoading,
    vouches,
    vouchedCount,
    quotaTarget,
    resolutionAtMs,
    detail,
    setDetail,
    handleVouch: requestVouch, // route taps through the confirm dialog
    handleShare,
    onOpenHelp: openHelp,
    slotState,
    h1Status,
    activePicksCount,
    onUnlockMore,
    unlockRemaining,
    unlockMax: adUnlocks.max_per_day,
  };

  // Logged-out: replace the full feed with a casual landing that explains
  // the game and shows one real card from today's drop as a teaser.
  if (!user?.id) {
    const sampleCard = cards[0] ?? null;
    return (
      <>
        <SEO
          title="Discover — KTrenZ"
          description="Call the next viral K-pop content before anyone else. Vouch early, earn more."
          path="/h1"
        />
        <H1Landing
          sample={sampleCard ? {
            id: sampleCard.id,
            source: sampleCard.source,
            title: sampleCard.title,
            artist: sampleCard.artist,
            starImage: sampleCard.starImage,
            thumbnail: sampleCard.thumbnail,
          } : null}
          isLoading={isLoading}
        />
      </>
    );
  }

  return (
    <>
      <SEO
        title="Discover — KTrenZ"
        description="Call the next viral K-pop content before anyone else. Vouch early, earn more."
        path="/h1"
      />
      {isMobile ? <MobileShell {...shared} /> : <DesktopShell {...shared} />}
      <H1HowItWorksModal open={helpOpen} onClose={closeHelp} />
      <H1CallConfirmDialog
        open={!!pendingCall}
        tier={pendingCall?.tier ?? null}
        resolutionMs={resolutionAtMs}
        slots={h1Status.signed_in ? h1Status.slots : undefined}
        onCancel={() => setPendingCall(null)}
        onConfirm={() => {
          if (pendingCall) {
            handleVouch(pendingCall.cardId, pendingCall.tier);
          }
          setPendingCall(null);
        }}
      />
      <H1AdUnlockDialog
        open={adUnlockOpen}
        unlocksUsed={adUnlocks.used}
        unlocksMax={adUnlocks.max_per_day}
        onClose={() => setAdUnlockOpen(false)}
        onCompleted={(tier) => {
          trackH1Event("h1_ad_unlock_completed", { tier });
          toast({
            title: tFmt(t("h1.adUnlock.toastGranted"), { tier: `×${tier === "mid" ? 2 : 4}` }),
          });
          void refetchStatus();
        }}
      />
      <LoginNudge
        open={!!loginNudgeOpen}
        trigger={loginNudgeOpen || "share"}
        onClose={() => {
          trackH1Event("h1_login_nudge_dismissed", { trigger: loginNudgeOpen || "unknown" });
          setLoginNudgeOpen(false);
        }}
        onSignIn={() => {
          trackH1Event("h1_login_nudge_clicked", { trigger: loginNudgeOpen || "unknown" });
          const redirect = encodeURIComponent(window.location.pathname + window.location.search);
          window.location.href = `/login?redirect=${redirect}`;
        }}
      />
    </>
  );
}

/* ─────── Login nudge ─────── */
function LoginNudge({
  open,
  trigger,
  onClose,
  onSignIn,
}: {
  open: boolean;
  trigger: "share" | "quota" | string;
  onClose: () => void;
  onSignIn: () => void;
}) {
  if (!open) return null;
  const headline = trigger === "share"
    ? "Sign in to share your slate"
    : "You're qualified — keep your calls.";
  const sub = trigger === "share"
    ? "Public share artifacts attach to a real account so you get K-Cash credit when calls hit and a permanent caller history."
    : "Sign in to lock in today's vouches across devices, climb the leaderboard, and earn K-Cash on hits.";
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-neutral-950 rounded-t-3xl sm:rounded-3xl border-t sm:border border-white/10 p-6 sm:mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-5 sm:hidden" />
        <h3 className="text-xl font-black text-white tracking-tight mb-2">
          {headline}
        </h3>
        <p className="text-sm text-white/65 leading-relaxed mb-6">{sub}</p>
        <button
          onClick={onSignIn}
          className="w-full px-5 py-3.5 rounded-2xl bg-white text-black font-black text-sm hover:scale-[1.01] transition-transform shadow-lg mb-2"
        >
          Sign in
        </button>
        <button
          onClick={onClose}
          className="w-full px-5 py-2.5 rounded-2xl text-white/55 text-sm font-bold hover:text-white"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
