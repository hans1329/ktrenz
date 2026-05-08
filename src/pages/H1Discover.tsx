/**
 * /h1 — Discover game (Content-First "이게 뜰까?")
 * Mobile: full-screen vertical feed.
 * Desktop: full-width header + sidebar + card grid.
 * Spec: docs/discover_game_mechanics.md
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import SEO from "@/components/SEO";
import {
  Sparkles, Clock, Eye, Share2, Trophy, History, Flame,
  Youtube, Music2, Newspaper, Play, X, ChevronRight, Check,
  Zap, TrendingUp, Users, Loader2, ExternalLink,
  Sprout, Activity, Rocket,
} from "lucide-react";
import ktrenzLogo from "@/assets/logo_nd.webp";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLanguage } from "@/contexts/LanguageContext";
import { useFieldTranslation } from "@/hooks/useFieldTranslation";
import { useAuth } from "@/contexts/AuthContext";
import { trackH1Event } from "@/lib/h1Telemetry";
import H1AuthChip from "@/components/h1/H1AuthChip";
import { cn } from "@/lib/utils";

/* ─────── Types ─────── */
type Source = "youtube" | "tiktok" | "shorts" | "spotify" | "news" | "naver_news" | "naver_blog" | "instagram" | "reddit" | string;
type Vouch = "low" | "mid" | "high";

type DiscoverCard = {
  id: string;
  source: Source;
  title: string;
  description: string;
  artist: string;
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
// PRD §5 L1 — minimum 30% of shown cards must be vouched to qualify for
// leaderboard/mining. Vouching beyond the target is allowed and encouraged.
const DAILY_QUOTA_PCT = 0.3;
const DAILY_QUOTA_TARGET = Math.ceil(DROP_SIZE * DAILY_QUOTA_PCT);
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
const HEADER_H = 88;        // px — sticky header height (2 rows + hairline)
const BOTTOM_NAV_H = 68;    // px — bottom nav height

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
function youtubeVideoId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/);
  return m?.[1] ?? null;
}

// Pick an iframe embed strategy based on source URL.
// Each embed declares its own aspect ratio so the modal renders at native size.
// Returns null when no inline embed is supported (news, blog, spotify, etc.).
type EmbedInfo = { kind: "youtube" | "tiktok" | "instagram"; src: string; aspect: string };
function getEmbed(card: DiscoverCard): EmbedInfo | null {
  const ytId = youtubeVideoId(card.url);
  if (ytId && (card.source === "youtube" || card.source === "shorts")) {
    const isShorts = card.source === "shorts" || /youtube\.com\/shorts\//.test(card.url);
    // Mirror Battle.tsx's working embed config exactly — anything more clever
    // (nocookie host, enablejsapi, playsinline, referrerPolicy) silently
    // breaks playback on a chunk of videos. Keep it minimal.
    return {
      kind: "youtube",
      src: `https://www.youtube.com/embed/${ytId}?rel=0&autoplay=1&mute=1`,
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
        src: `https://www.tiktok.com/player/v1/${m[1]}?autoplay=1&music_info=1&description=0&controls=1&progress_bar=1&play_button=1&volume_control=1&loop=0&rel=0`,
        // player/v1 is just the video frame (no chrome), close to 9:16.
        aspect: "9 / 16",
      };
    }
  }
  if (card.source === "instagram") {
    const m = card.url.match(/instagram\.com\/(p|reel|tv)\/([\w-]+)/);
    if (m) {
      const isVideo = m[1] === "reel" || m[1] === "tv";
      return {
        kind: "instagram",
        // Instagram /embed page renders the original media — for reels that's
        // a tappable poster; full autoplay isn't honored by IG embeds.
        src: `https://www.instagram.com/${m[1]}/${m[2]}/embed`,
        // Reel: 9:16 video + chrome. Photo: roughly 4:5 + chrome.
        aspect: isVideo ? "9 / 17" : "4 / 5.6",
      };
    }
  }
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
  starImage: string | null;
};

function pickLocalized(row: any, base: "title" | "description", language: string): string {
  const v =
    language === "ko" ? row[`${base}_ko`] :
    language === "ja" ? row[`${base}_ja`] :
    language === "zh" ? row[`${base}_zh`] :
    row[`${base}_en`];
  return v || row[base] || "";
}

function buildCard(row: NormalizedRow, language: string): DiscoverCard {
  const palette = paletteFor(row.artist || row.id);
  return {
    id: row.id,
    source: row.source as Source,
    title: pickLocalized(row, "title", language),
    description: pickLocalized(row, "description", language),
    artist: row.artist,
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

/* ─────── Vouch persistence (localStorage, scoped per day) ─────── */
function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${VOUCH_STORAGE_KEY_PREFIX}${y}-${m}-${day}`;
}

function loadVouches(): Record<string, Vouch> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(todayKey());
    return raw ? (JSON.parse(raw) as Record<string, Vouch>) : {};
  } catch {
    return {};
  }
}

function saveVouches(v: Record<string, Vouch>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(todayKey(), JSON.stringify(v));
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
// Backend scoring still applies confidence weights internally.
const VOUCH_META = {
  low:  { label: "Hunch",  hint: "low conviction",  icon: Sprout,   shade: "from-amber-400 to-amber-500",  ring: "ring-amber-400/40",  glow: "shadow-amber-400/30" },
  mid:  { label: "Likely", hint: "fair shot",        icon: Activity, shade: "from-orange-400 to-orange-500", ring: "ring-orange-400/40", glow: "shadow-orange-500/30" },
  high: { label: "Sure!",  hint: "going viral",      icon: Rocket,   shade: "from-rose-400 to-red-500",     ring: "ring-rose-400/50",   glow: "shadow-rose-500/40" },
} as const;

function VouchPill({
  level,
  active,
  onClick,
}: {
  level: "low" | "mid" | "high";
  active: boolean;
  onClick: () => void;
}) {
  const c = VOUCH_META[level];
  const Icon = c.icon;
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex-1 flex flex-col items-center justify-center pt-3 pb-3 rounded-2xl transition-all overflow-hidden border",
        active
          ? `bg-gradient-to-b ${c.shade} text-white shadow-xl ${c.glow} border-white/30 scale-[1.04] ring-2 ${c.ring}`
          : "bg-white/[0.06] backdrop-blur-md text-white border-white/10 hover:bg-white/10 hover:border-white/20 active:scale-95",
      )}
    >
      <Icon
        className={cn(
          "w-7 h-7 mb-1.5 transition-transform",
          active ? "drop-shadow-lg" : "opacity-80",
          level === "high" && active && "animate-pulse",
        )}
        strokeWidth={active ? 2.5 : 2}
      />
      <span className="text-[15px] font-black tracking-tight leading-none">{c.label}</span>
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
}: {
  card: DiscoverCard;
  vouch: Vouch | undefined;
  onVouch: (v: Vouch) => void;
  onOpenDetail: () => void;
  onScrollNext: () => void;
}) {
  const { Icon, label } = sourceMeta(card.source);
  const decided = !!vouch;

  return (
    <section
      className="snap-start shrink-0 h-full w-full relative bg-neutral-950 flex flex-col"
      style={{ paddingTop: HEADER_H, paddingBottom: BOTTOM_NAV_H }}
    >
      {/* ── Section 1: Image (top half) ── */}
      <button
        type="button"
        onClick={onOpenDetail}
        className="relative w-full bg-neutral-900 overflow-hidden"
        style={{ flex: "0 0 50%" }}
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
      <div className="flex-1 min-h-0 flex flex-col px-5 pt-5 pb-3 bg-neutral-950">
        <button
          type="button"
          onClick={onOpenDetail}
          className="block text-left w-full mb-4"
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
          <h2 className="text-[24px] leading-[1.15] font-black text-white tracking-tight mb-3 line-clamp-3">
            {card.title}
          </h2>
          <div className="text-white/45 text-xs">
            tap for details
          </div>
        </button>

        <div className="mt-auto">
          <div className="mb-2 inline-flex items-center gap-1.5 text-white/70 text-[10px] font-bold uppercase tracking-[0.18em]">
            <TrendingUp className="w-3 h-3" />
            Will this go viral in 7 days?
          </div>

          <div className="flex gap-2">
            <VouchPill level="low"  active={vouch === "low"}  onClick={() => onVouch("low")} />
            <VouchPill level="mid"  active={vouch === "mid"}  onClick={() => onVouch("mid")} />
            <VouchPill level="high" active={vouch === "high"} onClick={() => onVouch("high")} />
          </div>

          <div className="mt-2 flex items-center justify-end min-h-[32px]">
            {decided && (
              <button
                onClick={onScrollNext}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-[11px] font-bold transition-all"
              >
                Next <ChevronRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────── Detail drawer ─────── */
function DetailDrawer({
  card,
  open,
  onClose,
}: {
  card: DiscoverCard | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!open || !card) return null;
  const { Icon, label } = sourceMeta(card.source);
  const embed = getEmbed(card);
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-neutral-950 rounded-t-3xl sm:rounded-3xl border-t sm:border border-white/10 max-h-[88vh] sm:max-h-[85vh] overflow-y-auto flex flex-col sm:mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar — short title on the left, close on the right.
            Sticky so it stays accessible while scrolling long content. */}
        <div className="sticky top-0 z-20 flex items-center gap-3 px-4 py-2.5 bg-neutral-950/95 backdrop-blur border-b border-white/10 shrink-0">
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
            <span className="text-sm font-bold text-white truncate">
              {card.title}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Hero — embed when supported, otherwise thumbnail.
            Each embed renders at its native aspect (declared in getEmbed).
            Uses padding-bottom (not aspectRatio CSS) because aspectRatio
            doesn't always size cross-origin iframes correctly — this is the
            same pattern Battle.tsx uses for its working YouTube embeds.
            shrink-0 prevents flex compression when description is long. */}
        <div
          className="relative w-full shrink-0 bg-black overflow-hidden"
          style={{ paddingBottom: aspectToPadding(embed?.aspect ?? "16 / 9") }}
        >
          {embed ? (
            <iframe
              src={embed.src}
              title={card.title}
              className="absolute inset-0 w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
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
        <div className="p-5 flex-1">
          {/* Source chip + artist row */}
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

          <h3 className="text-xl font-black text-white leading-tight tracking-tight mb-4">
            {card.title}
          </h3>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="rounded-2xl bg-white/5 p-3.5">
              <div className="text-[10px] uppercase font-bold text-white/50 mb-1 tracking-wider">Buzz now</div>
              <div className="text-xl font-black text-white tabular-nums">{formatViews(card.currentViews)}</div>
            </div>
            <div className="rounded-2xl bg-white/5 p-3.5">
              <div className="text-[10px] uppercase font-bold text-white/50 mb-1 tracking-wider">Posted</div>
              <div className="text-xl font-black text-white tabular-nums">{formatAge(card.publishedAt)}</div>
            </div>
          </div>

          {/* Description */}
          {card.description && (
            <p className="text-sm text-white/70 leading-relaxed mb-5 line-clamp-6 whitespace-pre-line">
              {card.description}
            </p>
          )}

          <p className="text-[11px] text-white/40 text-center leading-relaxed">
            Browsing details counts as engagement only — vouching still requires the buttons.
          </p>

          {/* De-emphasized source link */}
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
      </div>
    </div>
  );
}

/* ─────── Completion screen ─────── */
function CompletionCard({
  vouches,
  totalCards,
  onShare,
}: {
  vouches: Record<string, Vouch>;
  totalCards: number;
  onShare: () => void;
}) {
  const vouched = Object.keys(vouches).length;
  const passed = totalCards - vouched;
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
        <p className="text-white/70 text-sm leading-relaxed mb-8">
          Resolves at midnight. Share your calls now to flex when they hit —
          early callers get bragging rights.
        </p>
        <button
          onClick={onShare}
          className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl bg-white text-black font-black text-sm hover:scale-[1.02] transition-transform shadow-2xl"
        >
          <Share2 className="w-4 h-4" /> Share my calls
        </button>
      </div>
    </section>
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
  resolutionMs,
}: {
  vouchedCount: number;
  resolutionMs: number;
}) {
  const { h, m, s } = useCountdown(resolutionMs);
  const quotaMet = vouchedCount >= DAILY_QUOTA_TARGET;
  // Pre-quota: progress vs target. Post-quota: progress vs full drop (bonus zone).
  const denom = quotaMet ? DROP_SIZE : DAILY_QUOTA_TARGET;
  const pct = Math.min(100, (vouchedCount / denom) * 100);

  return (
    <header
      className="absolute inset-x-0 top-0 z-40 bg-black/55 backdrop-blur-xl border-b border-white/10"
      style={{ height: HEADER_H }}
    >
      {/* Row 1 — brand */}
      <div className="flex items-center justify-between px-4 pt-2.5">
        <div className="flex items-center gap-2.5">
          <img src={ktrenzLogo} alt="K-TRENZ" className="h-4 w-auto" />
          <div className="flex items-center gap-1.5">
            <span className="text-white text-[11px] font-black tracking-[0.22em] uppercase">Discover</span>
            <span className="px-1.5 py-0.5 rounded-md bg-rose-500/20 text-rose-300 text-[8px] font-black tracking-wider uppercase border border-rose-400/30">Beta</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Link
            to="/"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/15 backdrop-blur text-white/85 text-[10px] font-bold transition-colors"
          >
            <Zap className="w-3 h-3" /> Pro Battle
          </Link>
          <H1AuthChip compact />
        </div>
      </div>

      {/* Row 2 — context (today's drop · countdown · quota chip) */}
      <div className="flex items-center justify-between px-4 pt-2 pb-2.5">
        <div className="flex items-center gap-1.5 text-white">
          <span className="text-[11px] font-bold tracking-wider uppercase">Today's Drop</span>
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
          {vouchedCount}/{quotaMet ? DROP_SIZE : DAILY_QUOTA_TARGET}
        </div>
      </div>

      {/* Hairline progress */}
      <div className="absolute bottom-0 inset-x-0 h-[2px] bg-white/5">
        <div
          className={`h-full transition-all ${
            quotaMet ? "bg-gradient-to-r from-rose-500 to-orange-400" : "bg-white/40"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </header>
  );
}

/* ─────── Bottom nav ─────── */
function BottomNav() {
  return (
    <nav
      className="absolute bottom-0 inset-x-0 z-40 bg-black/65 backdrop-blur-xl border-t border-white/10"
      style={{ height: BOTTOM_NAV_H, paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="grid grid-cols-4 h-full px-2">
        <NavBtn icon={Flame} label="Discover" to="/h1" active />
        <NavBtn icon={History} label="History" to="/h1/history" />
        <NavBtn icon={Trophy} label="Ranks" to="/h1/leaderboard" />
        <NavBtn icon={Zap} label="Pro" to="/" />
      </div>
    </nav>
  );
}

function NavBtn({
  icon: Icon,
  label,
  to,
  active = false,
}: {
  icon: React.ElementType;
  label: string;
  to: string;
  active?: boolean;
}) {
  return (
    <Link
      to={to}
      className={`flex flex-col items-center justify-center gap-0.5 transition-colors ${
        active ? "text-white" : "text-white/45 hover:text-white/80"
      }`}
    >
      <Icon className={`w-5 h-5 ${active ? "fill-white/15" : ""}`} strokeWidth={active ? 2.5 : 2} />
      <span className="text-[9.5px] font-bold tracking-tight">{label}</span>
    </Link>
  );
}

/* ════════════════════════════════════════
   DESKTOP LAYOUT
   ════════════════════════════════════════ */

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
  resolutionMs,
}: {
  vouchedCount: number;
  resolutionMs: number;
}) {
  const { h, m, s } = useCountdown(resolutionMs);
  const quotaMet = vouchedCount >= DAILY_QUOTA_TARGET;

  return (
    <header className="sticky top-0 z-40 bg-black/75 backdrop-blur-xl border-b border-white/10">
      <div className="max-w-[1400px] mx-auto h-16 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <img src={ktrenzLogo} alt="K-TRENZ" className="h-5 w-auto" />
          <div className="h-5 w-px bg-white/15" />
          <div className="flex items-center gap-2">
            <span className="text-white text-[12px] font-black tracking-[0.22em] uppercase">Discover</span>
            <span className="px-1.5 py-0.5 rounded-md bg-rose-500/20 text-rose-300 text-[9px] font-black tracking-wider uppercase border border-rose-400/30">Beta</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/85 text-xs font-medium">
            <span className="hidden md:inline">Today's Drop ·</span>
            <span className="font-bold tabular-nums">
              {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
            </span>
          </div>
          <div
            className={`hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-black tabular-nums border transition-colors ${
              quotaMet
                ? "bg-rose-500/20 text-rose-200 border-rose-400/40"
                : "bg-white/5 text-white/85 border-white/10"
            }`}
          >
            {quotaMet ? <Check className="w-3 h-3" /> : <Flame className="w-3 h-3" />}
            {vouchedCount}/{quotaMet ? DROP_SIZE : DAILY_QUOTA_TARGET}
          </div>
          <div className="w-px h-6 bg-white/10 mx-1" />
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition-colors"
          >
            <Zap className="w-3.5 h-3.5" /> Pro Battle
          </Link>
          <H1AuthChip />
        </div>
      </div>
    </header>
  );
}

function DesktopSidebar({ vouchedCount }: { vouchedCount: number }) {
  const quotaMet = vouchedCount >= DAILY_QUOTA_TARGET;
  // Pre-quota: progress vs target. Post-quota: progress vs full drop (bonus zone).
  const denom = quotaMet ? DROP_SIZE : DAILY_QUOTA_TARGET;
  const pct = Math.min(100, (vouchedCount / denom) * 100);

  return (
    <aside className="hidden lg:flex flex-col w-64 shrink-0 sticky top-16 h-[calc(100vh-4rem)] border-r border-white/10 px-4 py-6 gap-5 overflow-y-auto scrollbar-hide">
      {/* Nav */}
      <nav className="flex flex-col gap-0.5">
        <SidebarNavItem icon={Flame} label="Discover" to="/h1" active />
        <SidebarNavItem icon={History} label="History" to="/h1/history" />
        <SidebarNavItem icon={Trophy} label="Leaderboard" to="/h1/leaderboard" />
        <SidebarNavItem icon={Users} label="Squads" hint="soon" disabled />
      </nav>

      {/* Quota card */}
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
          {vouchedCount}<span className="text-white/40 text-xl">/{quotaMet ? DROP_SIZE : DAILY_QUOTA_TARGET}</span>
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
            ? "You're qualified for today's leaderboard & token mining. Keep vouching for time-decay bonus."
            : `Vouch on ${DAILY_QUOTA_TARGET - vouchedCount} more to qualify. Earlier calls = bigger reward.`}
        </p>
      </div>

      <LeaderboardPreview />

      <div className="mt-auto px-1 text-[9px] text-white/25 tracking-wider uppercase">
        h1 · prototype · mock data
      </div>
    </aside>
  );
}

function SidebarNavItem({
  icon: Icon,
  label,
  to,
  active = false,
  hint,
  disabled = false,
}: {
  icon: React.ElementType;
  label: string;
  to?: string;
  active?: boolean;
  hint?: string;
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
      {hint && (
        <span className="text-[10px] font-medium text-white/40 uppercase tracking-wider">{hint}</span>
      )}
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
}: {
  card: DiscoverCard;
  vouch: Vouch | undefined;
  onVouch: (v: Vouch) => void;
  onOpenDetail: () => void;
}) {
  const { Icon, label } = sourceMeta(card.source);
  const decided = !!vouch;

  return (
    <article
      className={`group relative rounded-2xl overflow-hidden border bg-neutral-950 transition-all hover:-translate-y-0.5 ${
        decided
          ? "border-rose-500/30 shadow-[0_0_30px_rgba(244,63,94,0.08)]"
          : "border-white/10 hover:border-white/25 hover:shadow-[0_20px_40px_rgba(0,0,0,0.5)]"
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
          <div className="absolute top-2.5 left-1/2 -translate-x-1/2 z-30 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-rose-500 to-orange-500 text-white text-[10px] font-black uppercase tracking-wider shadow-lg">
            <Check className="w-2.5 h-2.5" strokeWidth={3} /> Vouched · {vouch}
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
        <h3 className="text-base font-black text-white leading-[1.2] tracking-tight line-clamp-2 mb-2 min-h-[2.4em]">
          {card.title}
        </h3>
      </button>

      {/* ── Section 3: Vouch row ── */}
      <div className="px-4 pb-3.5 pt-2 border-t border-white/5">
        {!decided ? (
          <>
            <div className="text-[10px] font-bold text-white/50 uppercase tracking-wider mb-1.5">
              Will it go viral?
            </div>
            <div className="flex gap-1.5">
              <DesktopVouchBtn level="low"  active={false} onClick={() => onVouch("low")} />
              <DesktopVouchBtn level="mid"  active={false} onClick={() => onVouch("mid")} />
              <DesktopVouchBtn level="high" active={false} onClick={() => onVouch("high")} />
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1.5 text-xs">
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-white/55">Called:</span>
              <span className="font-black text-white">{VOUCH_META[vouch].label}</span>
            </div>
            <div className="flex gap-1">
              {(["low", "mid", "high"] as const).map((l) => {
                const LIcon = VOUCH_META[l].icon;
                return (
                  <button
                    key={l}
                    onClick={() => onVouch(l)}
                    title={`Change to ${VOUCH_META[l].label}`}
                    className={`p-1.5 rounded transition-colors ${
                      vouch === l
                        ? "bg-rose-500/30 text-rose-200"
                        : "text-white/40 hover:text-white/80 hover:bg-white/5"
                    }`}
                  >
                    <LIcon className="w-3.5 h-3.5" strokeWidth={vouch === l ? 2.5 : 2} />
                  </button>
                );
              })}
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
}: {
  level: "low" | "mid" | "high";
  active: boolean;
  onClick: () => void;
}) {
  const c = VOUCH_META[level];
  const Icon = c.icon;
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 rounded-xl text-xs font-black tracking-tight transition-all border active:scale-95",
        active
          ? `bg-gradient-to-b ${c.shade} text-white shadow-lg ${c.glow} border-white/25 ring-1 ${c.ring}`
          : "bg-white/[0.04] text-white/80 border-white/10 hover:bg-white/[0.08] hover:border-white/20 hover:text-white",
      )}
    >
      <Icon className="w-3.5 h-3.5 mb-0.5" strokeWidth={active ? 2.5 : 2} />
      <span className="leading-none">{c.label}</span>
    </button>
  );
}

/* ─────── Desktop shell ─────── */
function DesktopShell({
  cards,
  isLoading,
  vouches,
  vouchedCount,
  resolutionAtMs,
  detail,
  setDetail,
  handleVouch,
  handleShare,
}: {
  cards: DiscoverCard[];
  isLoading: boolean;
  vouches: Record<string, Vouch>;
  vouchedCount: number;
  resolutionAtMs: number;
  detail: DiscoverCard | null;
  setDetail: (c: DiscoverCard | null) => void;
  handleVouch: (cardId: string, v: Vouch) => void;
  handleShare: () => void;
}) {
  const allDecided = cards.length > 0 && vouchedCount >= cards.length;

  return (
    <div className="min-h-screen bg-neutral-950 text-white relative">
      {/* Ambient brand backdrop (subtle) */}
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
        <div className="absolute -top-1/3 -left-1/4 w-[60vw] h-[60vh] rounded-full blur-[200px] opacity-20 bg-rose-600" />
        <div className="absolute -bottom-1/3 -right-1/4 w-[60vw] h-[60vh] rounded-full blur-[200px] opacity-15 bg-orange-500" />
      </div>

      <DesktopHeader vouchedCount={vouchedCount} resolutionMs={resolutionAtMs} />

      <div className="max-w-[1400px] mx-auto flex">
        <DesktopSidebar vouchedCount={vouchedCount} />

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
              <button
                onClick={handleShare}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white text-black font-black text-sm hover:scale-[1.02] transition-transform shadow-2xl"
              >
                <Share2 className="w-4 h-4" /> Share my calls
              </button>
            </div>
          )}
        </main>
      </div>

      <DetailDrawer card={detail} open={!!detail} onClose={() => setDetail(null)} />
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
  resolutionAtMs,
  detail,
  setDetail,
  handleVouch,
  handleShare,
}: {
  cards: DiscoverCard[];
  isLoading: boolean;
  vouches: Record<string, Vouch>;
  vouchedCount: number;
  resolutionAtMs: number;
  detail: DiscoverCard | null;
  setDetail: (c: DiscoverCard | null) => void;
  handleVouch: (cardId: string, v: Vouch) => void;
  handleShare: () => void;
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
      <Header vouchedCount={vouchedCount} resolutionMs={resolutionAtMs} />

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
            />
          ))}
          <CompletionCard vouches={vouches} totalCards={cards.length} onShare={handleShare} />
        </div>
      )}

      <BottomNav />

      <DetailDrawer card={detail} open={!!detail} onClose={() => setDetail(null)} />
    </div>
  );
}

/* ════════════════════════════════════════
   PAGE
   ════════════════════════════════════════ */
export default function H1Discover() {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { data: cards = [], isLoading } = useDiscoverCards();

  const resolutionAtMs = useMemo(() => {
    const next = new Date();
    next.setHours(24, 0, 0, 0);
    return next.getTime();
  }, []);

  const [vouches, setVouches] = useState<Record<string, Vouch>>(() => loadVouches());
  const [detail, setDetail] = useState<DiscoverCard | null>(null);
  const [loginNudgeOpen, setLoginNudgeOpen] = useState<false | "share" | "quota">(false);
  const lastSyncedUserRef = useRef<string | null>(null);
  const quotaNudgedRef = useRef(false);

  // Persist vouches to localStorage on every change (scoped per day).
  // Acts as offline cache + non-auth fallback. When the user is authed,
  // the server is source of truth and localStorage just mirrors.
  useEffect(() => {
    saveVouches(vouches);
  }, [vouches]);

  // Page-view telemetry (fires once per session per refresh).
  useEffect(() => {
    trackH1Event("h1_page_view", { page: "discover" });
  }, []);

  // On login flip: (1) push any anon localStorage vouches up to the server,
  // then (2) hydrate today's server vouches into local state. Server wins
  // for any conflicts because record_vouch upserts.
  useEffect(() => {
    if (!user?.id) return;
    if (lastSyncedUserRef.current === user.id) return;
    lastSyncedUserRef.current = user.id;

    let cancelled = false;
    (async () => {
      // 1. Replay localStorage vouches (one-shot sync on login).
      const local = loadVouches();
      const entries = Object.entries(local);
      if (entries.length > 0) {
        await Promise.all(entries.map(([itemId, conf]) =>
          (supabase as any).rpc("ktrenz_h1_record_vouch", {
            _item_id: itemId,
            _confidence: conf,
          }),
        ));
        trackH1Event("h1_localstorage_synced", { count: entries.length });
      }

      // 2. Pull current server state and merge.
      const { data, error } = await (supabase as any).rpc("ktrenz_h1_my_today_vouches");
      if (cancelled || error || !Array.isArray(data)) return;
      setVouches((prev) => {
        const merged = { ...prev };
        for (const row of data as Array<{ item_id: string; confidence: Vouch }>) {
          if (row?.item_id && row?.confidence) merged[row.item_id] = row.confidence;
        }
        return merged;
      });
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const vouchedCount = Object.keys(vouches).length;

  function handleVouch(cardId: string, v: Vouch) {
    const wasNew = !vouches[cardId];
    // Optimistic local update — UI never waits for the server round-trip.
    setVouches((prev) => ({ ...prev, [cardId]: v }));
    trackH1Event("h1_vouch", { item_id: cardId, confidence: v, was_new: wasNew, authed: !!user?.id });
    // Fire-and-forget server persist when authed. Failures keep the local
    // state intact so the user doesn't lose their pick if the network blips.
    if (user?.id) {
      void (supabase as any)
        .rpc("ktrenz_h1_record_vouch", { _item_id: cardId, _confidence: v })
        .then(({ error }: { error: unknown }) => {
          if (error) console.warn("[h1] record_vouch failed:", error);
        });
    } else if (wasNew) {
      // Quota-cross nudge: anon user just hit the qualifying threshold.
      // Fire once per session so we don't keep nagging on every vouch.
      const nextCount = vouchedCount + 1;
      if (nextCount >= DAILY_QUOTA_TARGET && !quotaNudgedRef.current) {
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

  const shared = {
    cards,
    isLoading,
    vouches,
    vouchedCount,
    resolutionAtMs,
    detail,
    setDetail,
    handleVouch,
    handleShare,
  };

  return (
    <>
      <SEO
        title="Discover — KTrenZ"
        description="Call the next viral K-pop content before anyone else. Vouch early, earn more."
        path="/h1"
      />
      {isMobile ? <MobileShell {...shared} /> : <DesktopShell {...shared} />}
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
