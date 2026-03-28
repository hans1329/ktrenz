import { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/hooks/useAuth";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useTrackEvent } from "@/hooks/useTrackEvent";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { TrendingUp, Clock, Star, Heart, ChevronRight, LayoutGrid, List, Users, MoreVertical, Zap, Database, MessageCircle } from "lucide-react";
import T2DetailSheet from "./T2DetailSheet";
import BoxParticles from "@/components/v3/BoxParticles";
import T2AdminControls from "./T2AdminControls";
import T2TrendList from "./T2TrendList";
import T2ArtistList from "./T2ArtistList";
import T2TopCards from "./T2TopCards";

// ── Types ──
export interface TrendTile {
  id: string;
  keyword: string;
  keywordKo: string | null;
  keywordJa: string | null;
  keywordZh: string | null;
  category: string;
  artistName: string;
  artistNameKo: string | null;
  artistImageUrl: string | null;
  wikiEntryId: string;
  influenceIndex: number;
  context: string | null;
  contextKo: string | null;
  contextJa: string | null;
  contextZh: string | null;
  detectedAt: string;
  peakAt: string | null;
  expiredAt: string | null;
  lifetimeHours: number | null;
  peakDelayHours: number | null;
  baselineScore: number | null;
  peakScore: number | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
  sourceImageUrl: string | null;
  sourceSnippet: string | null;
  starId: string | null;
  status: string;
  triggerSource: string | null;
  prevApiTotal: number | null;
  brandId: string | null;
}

export type SortMode = "rate" | "volume";

function getLocalizedArtistName(tile: TrendTile, lang: string): string {
  if (lang === "ko" && tile.artistNameKo) return tile.artistNameKo;
  return tile.artistName;
}

function getLocalizedKeyword(tile: TrendTile, lang: string): string {
  switch (lang) {
    case "ko": return tile.keywordKo || tile.keyword;
    case "ja": return tile.keywordJa || tile.keyword;
    case "zh": return tile.keywordZh || tile.keyword;
    default: return tile.keyword;
  }
}

// Platform logo SVGs for fallback when source image is missing
const PLATFORM_LOGOS: Record<string, string> = {
  facebook: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='16' fill='%231877F2'/%3E%3Cpath d='M62.5 52.5h-8.75v26.25h-11.25V52.5H35V42.5h7.5v-6.25c0-7.5 4.5-11.25 11.25-11.25 3.25 0 6.25.625 6.25.625V33h-3.5c-3.5 0-4.5 2.125-4.5 4.375V42.5h8l-1.25 10h-6.75v26.25' fill='white'/%3E%3C/svg%3E",
  instagram: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cdefs%3E%3ClinearGradient id='ig' x1='0' y1='1' x2='1' y2='0'%3E%3Cstop offset='0%25' stop-color='%23feda75'/%3E%3Cstop offset='25%25' stop-color='%23fa7e1e'/%3E%3Cstop offset='50%25' stop-color='%23d62976'/%3E%3Cstop offset='75%25' stop-color='%23962fbf'/%3E%3Cstop offset='100%25' stop-color='%234f5bd5'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='100' height='100' rx='16' fill='url(%23ig)'/%3E%3Crect x='22' y='22' width='56' height='56' rx='14' stroke='white' stroke-width='5' fill='none'/%3E%3Ccircle cx='50' cy='50' r='14' stroke='white' stroke-width='5' fill='none'/%3E%3Ccircle cx='68' cy='32' r='4' fill='white'/%3E%3C/svg%3E",
  reddit: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='16' fill='%23FF4500'/%3E%3Ccircle cx='50' cy='55' r='20' fill='white'/%3E%3Ccircle cx='42' cy='52' r='4' fill='%23FF4500'/%3E%3Ccircle cx='58' cy='52' r='4' fill='%23FF4500'/%3E%3Cpath d='M40 62c0 0 4 6 10 6s10-6 10-6' stroke='%23FF4500' stroke-width='2.5' fill='none' stroke-linecap='round'/%3E%3Ccircle cx='68' cy='32' r='6' fill='white'/%3E%3Cpath d='M56 30l10 2' stroke='white' stroke-width='3'/%3E%3C/svg%3E",
  tiktok: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='16' fill='%23000'/%3E%3Cpath d='M62 25c0 0 3 12 14 14v10c-5 0-10-2-14-5v22c0 12-10 20-20 20-12 0-20-10-20-20 0-12 10-20 20-20v10c-6 0-10 4-10 10s4 10 10 10c6 0 10-5 10-10V25h10z' fill='white'/%3E%3C/svg%3E",
  youtube: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='16' fill='%23FF0000'/%3E%3Cpath d='M40 35v30l25-15z' fill='white'/%3E%3C/svg%3E",
  naver: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='16' fill='%2303C75A'/%3E%3Cpath d='M30 30h12l10 16V30h12v40H52L42 54v16H30z' fill='white'/%3E%3C/svg%3E",
};

export function detectPlatformLogo(sourceUrl: string | null, sourceImageUrl: string | null): string | null {
  const url = (sourceUrl || sourceImageUrl || '').toLowerCase();
  if (!url) return null;
  if (url.includes('facebook.com') || url.includes('fb.com') || url.includes('fbcdn.net')) return PLATFORM_LOGOS.facebook;
  if (url.includes('instagram.com') || url.includes('cdninstagram.com')) return PLATFORM_LOGOS.instagram;
  if (url.includes('reddit.com') || url.includes('redd.it')) return PLATFORM_LOGOS.reddit;
  if (url.includes('tiktok.com')) return PLATFORM_LOGOS.tiktok;
  if (url.includes('youtube.com') || url.includes('youtu.be') || url.includes('ytimg.com')) return PLATFORM_LOGOS.youtube;
  if (url.includes('naver.com') || url.includes('naver.net')) return PLATFORM_LOGOS.naver;
  return null;
}

// URLs from these domains are hotlink-protected and will always fail to load
export function isBlockedImageDomain(url: string | null): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  // Block hotlink-protected domains and HTTP-only URLs (mixed content fails on HTTPS)
  if (lower.startsWith('http://')) return true;
  return lower.includes('fbcdn.net') || lower.includes('cdninstagram.com') || lower.includes('scontent.') || lower.includes('tvdaily.co.kr');
}

export function sanitizeImageUrl(url: string | null): string | null {
  if (!url) return null;
  return url.replace(/&amp;/g, '&');
}

export type TrendCategory = "all" | "my" | "brand" | "product" | "place" | "food" | "fashion" | "beauty" | "media" | "music" | "event" | "shopping" | "social";

export const CATEGORY_CONFIG: Record<string, { label: string; color: string; tileColor: string }> = {
  brand:   { label: "Brand",   color: "hsl(210, 70%, 55%)", tileColor: "hsla(210, 15%, 42%, 0.72)" },
  product: { label: "Product", color: "hsl(270, 60%, 55%)", tileColor: "hsla(270, 12%, 40%, 0.72)" },
  place:   { label: "Place",   color: "hsl(145, 55%, 45%)", tileColor: "hsla(145, 10%, 38%, 0.72)" },
  food:    { label: "Food",    color: "hsl(25, 80%, 55%)",  tileColor: "hsla(25, 18%, 42%, 0.72)" },
  fashion: { label: "Fashion", color: "hsl(330, 65%, 55%)", tileColor: "hsla(330, 12%, 42%, 0.72)" },
  beauty:  { label: "Beauty",  color: "hsl(350, 60%, 55%)", tileColor: "hsla(350, 10%, 42%, 0.72)" },
  media:   { label: "Media",   color: "hsl(190, 70%, 45%)", tileColor: "hsla(190, 14%, 38%, 0.72)" },
  music:   { label: "Music",   color: "hsl(260, 70%, 60%)", tileColor: "hsla(260, 14%, 42%, 0.72)" },
  event:   { label: "Event",   color: "hsl(45, 85%, 50%)",  tileColor: "hsla(45, 18%, 40%, 0.72)" },
  shopping:{ label: "Goods", color: "hsl(160, 60%, 45%)", tileColor: "hsla(160, 10%, 38%, 0.72)" },
  social:  { label: "Social", color: "hsl(290, 65%, 55%)", tileColor: "hsla(290, 14%, 42%, 0.72)" },
};

export const ALL_CATEGORIES: TrendCategory[] = ["all", "my", "music", "brand", "product", "place", "food", "fashion", "beauty", "media", "event", "shopping", "social"];

// ── Age formatter ──
function formatAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "now";
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function normalizeTrendKey(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function compareTrendPriority(a: TrendTile, b: TrendTile, sortMode: SortMode = "rate"): number {
  if (sortMode === "volume") {
    // Hot: baseline 대비 최근 수집값(prevApiTotal) 절대 증가량
    const aVolume = (a.prevApiTotal ?? a.peakScore ?? 0) - (a.baselineScore ?? 0);
    const bVolume = (b.prevApiTotal ?? b.peakScore ?? 0) - (b.baselineScore ?? 0);
    if (bVolume !== aVolume) return bVolume - aVolume;
    if ((b.baselineScore ?? 0) !== (a.baselineScore ?? 0)) return (b.baselineScore ?? 0) - (a.baselineScore ?? 0);
    return new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime();
  }
  // rate mode (default): influence_index 기준
  if (b.influenceIndex !== a.influenceIndex) return b.influenceIndex - a.influenceIndex;
  if ((b.baselineScore ?? 0) !== (a.baselineScore ?? 0)) return (b.baselineScore ?? 0) - (a.baselineScore ?? 0);
  return new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime();
}

function buildTrendIdentity(tile: TrendTile): string {
  const artistKey = tile.starId || tile.wikiEntryId || normalizeTrendKey(tile.artistName);
  const keywordKey = normalizeTrendKey(tile.keywordKo || tile.keyword);
  const categoryKey = normalizeTrendKey(tile.category);
  return `${artistKey}::${categoryKey}::${keywordKey}`;
}

function dedupeTrendTiles(items: TrendTile[], sortMode: SortMode = "rate"): TrendTile[] {
  const uniqueMap = new Map<string, TrendTile>();

  for (const item of items) {
    const identity = buildTrendIdentity(item);
    const existing = uniqueMap.get(identity);

    if (!existing || compareTrendPriority(item, existing, sortMode) < 0) {
      uniqueMap.set(identity, item);
    }
  }

  return Array.from(uniqueMap.values()).sort((a, b) => compareTrendPriority(a, b, sortMode));
}

// ── Squarify layout ──
interface Rect { x: number; y: number; w: number; h: number; item: TrendTile; }

function squarify(items: TrendTile[], x: number, y: number, w: number, h: number, sortMode: SortMode = "rate", isCollecting = false): Rect[] {
  if (items.length === 0) return [];
  if (items.length === 1) return [{ x, y, w, h, item: items[0] }];

  const tileSize = (item: TrendTile, idx: number) => {
    const metric = sortMode === "volume"
      ? Math.max((item.prevApiTotal ?? item.peakScore ?? 0) - (item.baselineScore ?? 0), 1)
      : Math.max(item.influenceIndex, 1);
    // Single-log to preserve natural variance between scores
    const logBase = Math.log1p(metric);

    // Rank-based multiplier: steep exponential decay for clear size hierarchy
    const rankMultiplier = idx === 0 ? 1.0
      : idx === 1 ? 0.72
      : idx === 2 ? 0.55
      : idx === 3 ? 0.42
      : idx === 4 ? 0.34
      : idx < 8 ? 0.26
      : idx < 12 ? 0.19
      : idx < 16 ? 0.15
      : idx < 22 ? 0.13
      : idx < 35 ? 0.11
      : idx < 50 ? 0.10
      : 0.09;
    return logBase * rankMultiplier;
  };

  const totalValue = items.reduce((s, item, idx) => s + tileSize(item, idx), 0);
  const totalArea = w * h;
  const rawAreas = items.map((item, idx) => (tileSize(item, idx) / totalValue) * totalArea);
  // Cap per-tile area and enforce minimum so keywords are always visible
  const minArea = totalArea * 0.012;
  const areas = rawAreas.map((a, i) => {
    const cap = i === 0 ? totalArea * 0.08
      : i < 3 ? totalArea * 0.055
      : i < 6 ? totalArea * 0.04
      : totalArea * 0.025;
    return Math.max(Math.min(a, cap), minArea);
  });
  // Normalize to fill total area
  const areaSum = areas.reduce((s, a) => s + a, 0);
  const scale = totalArea / areaSum;
  for (let i = 0; i < areas.length; i++) areas[i] *= scale;
  const rects: Rect[] = [];
  let cx = x, cy = y, cw = w, ch = h, idx = 0;

  while (idx < items.length) {
    const isHorizontal = cw >= ch;
    const side = isHorizontal ? ch : cw;
    const row: number[] = [idx];
    let rowArea = areas[idx];
    let bestWorst = worstAspect(row.map(i => areas[i]), rowArea, side);

    for (let j = idx + 1; j < items.length; j++) {
      const testRow = [...row, j];
      const testArea = rowArea + areas[j];
      const testWorst = worstAspect(testRow.map(i => areas[i]), testArea, side);
      if (testWorst <= bestWorst) { row.push(j); rowArea = testArea; bestWorst = testWorst; } else break;
    }

    const rowLength = rowArea / side;
    let rx = cx, ry = cy;
    for (const ri of row) {
      const itemArea = areas[ri];
      const itemLength = itemArea / rowLength;
      if (isHorizontal) { rects.push({ x: rx, y: ry, w: rowLength, h: itemLength, item: items[ri] }); ry += itemLength; }
      else { rects.push({ x: rx, y: ry, w: itemLength, h: rowLength, item: items[ri] }); rx += itemLength; }
    }
    if (isHorizontal) { cx += rowLength; cw -= rowLength; } else { cy += rowLength; ch -= rowLength; }
    idx += row.length;
  }
  return rects;
}

function worstAspect(areas: number[], totalArea: number, side: number): number {
  const s2 = side * side; const t2 = totalArea * totalArea; let worst = 0;
  for (const a of areas) { const r1 = (s2 * a) / t2; const r2 = t2 / (s2 * a); worst = Math.max(worst, Math.max(r1, r2)); }
  return worst;
}

// ── My Artists compact banner ──
function MyArtistsBanner({ myKeywords, language }: { myKeywords: TrendTile[]; language: string }) {
  const navigate = useNavigate();
  // Pick top keyword (highest influence)
  const top = myKeywords[0];
  if (!top) return null;
  const config = CATEGORY_CONFIG[top.category];
  const artistCount = new Set(myKeywords.map(k => k.wikiEntryId)).size;

  return (
    <button
      onClick={() => navigate("/t2/my")}
      className="w-full mb-4 flex items-center gap-3 px-3 py-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 transition-all group"
    >
      <Heart className="w-4 h-4 text-amber-500 fill-amber-500 shrink-0" />
      <div className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-foreground truncate">{getLocalizedKeyword(top, language)}</span>
          <span
            className="text-[9px] font-semibold px-1 py-0.5 rounded-sm text-white shrink-0"
            style={{ background: config?.color }}
          >
            {config?.label}
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground truncate">
          My Picks · {getLocalizedArtistName(top, language)} · {artistCount} artists · {myKeywords.length} keywords
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
    </button>
  );
}

// ── Main Component ──
const T2TrendTreemap = ({ viewMode, onViewModeChange, selectedCategory: externalCategory, onCategoryChange, hideCategory, hideHeader, onCategoryStatsChange, sortMode: externalSortMode, onSortModeChange, mergedCategories, onMyKeywordsChange, gridMode }: { viewMode?: "treemap" | "list" | "artist"; onViewModeChange?: (mode: "treemap" | "list" | "artist") => void; selectedCategory?: TrendCategory; onCategoryChange?: (cat: TrendCategory) => void; hideCategory?: boolean; hideHeader?: boolean; onCategoryStatsChange?: (stats: Record<string, number>, total: number, myCount: number) => void; sortMode?: SortMode; onSortModeChange?: (mode: SortMode) => void; mergedCategories?: string[]; onMyKeywordsChange?: (items: TrendTile[]) => void; gridMode?: boolean }) => {
  const [internalCategory, setInternalCategory] = useState<TrendCategory>("all");
  const selectedCategory = externalCategory ?? internalCategory;
  const setSelectedCategory = onCategoryChange ?? setInternalCategory;
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedTile, setSelectedTile] = useState<TrendTile | null>(null);
  const [internalViewMode, setInternalViewMode] = useState<"treemap" | "list" | "artist">("treemap");
  const currentViewMode = viewMode ?? internalViewMode;
  const setViewMode = onViewModeChange ?? setInternalViewMode;
  const [internalSortMode, setInternalSortMode] = useState<SortMode>("volume");
  const sortMode = externalSortMode ?? internalSortMode;
  const setSortMode = onSortModeChange ?? setInternalSortMode;
  
  const isMobile = useIsMobile();
  const { language, t } = useLanguage();
  const { user } = useAuth();
  const { isAdmin } = useAdminAuth();
  
  const navigate = useNavigate();

  // Fetch user's watched artists (star_id based) — returns starIds + expanded member starIds
  const { data: watchedData } = useQuery({
    queryKey: ["t2-watched-artists-v2", user?.id],
    queryFn: async () => {
      if (!user?.id) return { starIds: [] as string[] };

      // 1. Get star_ids from ktrenz_watched_artists
      const { data: watched } = await supabase
        .from("ktrenz_watched_artists" as any)
        .select("star_id")
        .eq("user_id", user.id);
      const watchedStarIds = (watched ?? []).map((d: any) => d.star_id).filter(Boolean) as string[];

      // 2. Also get star_ids from ktrenz_agent_slots (최애 등록) via wiki_entry_id → star lookup
      const { data: slots } = await supabase
        .from("ktrenz_agent_slots")
        .select("wiki_entry_id")
        .eq("user_id", user.id)
        .not("wiki_entry_id", "is", null);
      const slotIds = (slots ?? []).map((d: any) => d.wiki_entry_id).filter(Boolean) as string[];
      let slotStarIds: string[] = [];
      if (slotIds.length > 0) {
        const { data: slotStars } = await supabase
          .from("ktrenz_stars" as any)
          .select("id")
          .in("wiki_entry_id", slotIds);
        slotStarIds = (slotStars ?? []).map((s: any) => s.id) as string[];
      }

      const directStarIds = [...new Set([...watchedStarIds, ...slotStarIds])];
      if (!directStarIds.length) return { starIds: [] };

      // 3. Expand: find members whose group_star_id matches any of these star_ids
      let allStarIds = [...directStarIds];
      if (directStarIds.length > 0) {
        const { data: members } = await supabase
          .from("ktrenz_stars" as any)
          .select("id")
          .in("group_star_id", directStarIds);
        const memberStarIds = (members ?? []).map((m: any) => m.id).filter(Boolean) as string[];
        allStarIds = [...new Set([...allStarIds, ...memberStarIds])];
      }

      return { starIds: allStarIds };
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  const watchedStarIds = watchedData?.starIds;
  const watchedStarSet = useMemo(() => new Set(watchedStarIds ?? []), [watchedStarIds]);

  const { data: followedTriggerIds = [] } = useQuery({
    queryKey: ["t2-keyword-follows-list", user?.id],
    queryFn: async () => {
      if (!user?.id) return [] as string[];
      const { data } = await supabase
        .from("ktrenz_keyword_follows" as any)
        .select("trigger_id")
        .eq("user_id", user.id);
      return (data ?? []).map((row: any) => row.trigger_id).filter(Boolean) as string[];
    },
    enabled: !!user?.id,
    staleTime: 10_000,
    placeholderData: [],
  });

  const followedTriggerSet = useMemo(() => new Set(followedTriggerIds ?? []), [followedTriggerIds]);

  const { data: predictedTriggerIds = [] } = useQuery({
    queryKey: ["t2-predicted-trigger-ids", user?.id],
    queryFn: async () => {
      if (!user?.id) return [] as string[];

      const { data: bets } = await supabase
        .from("ktrenz_trend_bets" as any)
        .select("market_id")
        .eq("user_id", user.id);

      if (!bets?.length) return [] as string[];

      const marketIds = [...new Set((bets as any[]).map((b: any) => b.market_id).filter(Boolean))];
      if (!marketIds.length) return [] as string[];

      const { data: markets } = await supabase
        .from("ktrenz_trend_markets" as any)
        .select("trigger_id, status")
        .in("id", marketIds)
        .in("status", ["open", "active", "pending"]);

      return [...new Set((markets ?? []).map((m: any) => m.trigger_id).filter(Boolean))] as string[];
    },
    enabled: !!user?.id,
    staleTime: 10_000,
    placeholderData: [],
  });

  const predictedTriggerSet = useMemo(() => new Set(predictedTriggerIds ?? []), [predictedTriggerIds]);

  // Separate stable query for watched-artist triggers (independent of trigger cache key)
  const { data: watchedTriggerTiles } = useQuery({
    queryKey: ["t2-watched-triggers", (watchedStarIds ?? []).slice().sort().join(",")],
    queryFn: async () => {
      if (!watchedStarIds?.length) return [] as TrendTile[];

      const { data } = await supabase
        .from("ktrenz_trend_triggers" as any)
        .select("*")
        .eq("status", "active")
        .in("star_id", watchedStarIds)
        .order("influence_index", { ascending: false })
        .limit(300);

      const raw = (data ?? []) as any[];
      const sIds = [...new Set(raw.map((t: any) => t.star_id).filter(Boolean))];
      const sMap = new Map<string, any>();
      if (sIds.length > 0) {
        const { data: stars } = await supabase
          .from("ktrenz_stars" as any)
          .select("id, wiki_entry_id, display_name, name_ko, group_star_id, image_url")
          .in("id", sIds);
        const wikiIds = new Set<string>();
        const groupIds = new Set<string>();
        (stars ?? []).forEach((s: any) => {
          if (s.wiki_entry_id) wikiIds.add(s.wiki_entry_id);
          if (s.group_star_id) groupIds.add(s.group_star_id);
        });
        const gwMap = new Map<string, string>();
        if (groupIds.size > 0) {
          const { data: gs } = await supabase.from("ktrenz_stars").select("id, wiki_entry_id").in("id", Array.from(groupIds));
          (gs ?? []).forEach((g: any) => { if (g.wiki_entry_id) { gwMap.set(g.id, g.wiki_entry_id); wikiIds.add(g.wiki_entry_id); } });
        }
        const imgMap = new Map<string, string>();
        if (wikiIds.size > 0) {
          const { data: we } = await supabase.from("wiki_entries").select("id, image_url").in("id", Array.from(wikiIds));
          (we ?? []).forEach((w: any) => { if (w.image_url) imgMap.set(w.id, w.image_url); });
        }
        (stars ?? []).forEach((s: any) => {
          const ownImg = s.wiki_entry_id ? imgMap.get(s.wiki_entry_id) : null;
          const gWikiId = s.group_star_id ? gwMap.get(s.group_star_id) : null;
          const gImg = gWikiId ? imgMap.get(gWikiId) : null;
          const sDirectImg = s.image_url && s.image_url !== "" ? s.image_url : null;
          sMap.set(s.id, {
            display_name: s.display_name,
            name_ko: s.name_ko,
            image_url: (ownImg && !isBlockedImageDomain(ownImg) ? ownImg : null)
              || (sDirectImg && !isBlockedImageDomain(sDirectImg) ? sDirectImg : null)
              || (gImg && !isBlockedImageDomain(gImg) ? gImg : null)
              || null,
            wiki_entry_id: s.wiki_entry_id || gWikiId,
          });
        });
      }

      return raw.map((t: any): TrendTile => {
        const star = t.star_id ? sMap.get(t.star_id) : null;
        return {
          id: t.id, keyword: t.keyword, keywordKo: t.keyword_ko || null, keywordJa: t.keyword_ja || null, keywordZh: t.keyword_zh || null,
          category: t.keyword_category || "brand", artistName: star?.display_name || t.artist_name || "Unknown",
          artistNameKo: star?.name_ko || null, artistImageUrl: star?.image_url || null,
          wikiEntryId: star?.wiki_entry_id || t.wiki_entry_id, influenceIndex: Number(t.influence_index) || 0,
          context: t.context, contextKo: t.context_ko || null, contextJa: t.context_ja || null, contextZh: t.context_zh || null,
          detectedAt: t.detected_at, peakAt: t.peak_at || null, expiredAt: t.expired_at || null,
          lifetimeHours: t.lifetime_hours != null ? Number(t.lifetime_hours) : null,
          peakDelayHours: t.peak_delay_hours != null ? Number(t.peak_delay_hours) : null,
          baselineScore: t.baseline_score != null ? Number(t.baseline_score) : null,
          peakScore: t.peak_score != null ? Number(t.peak_score) : null,
          sourceUrl: t.source_url || null, sourceTitle: t.source_title || null, sourceImageUrl: t.source_image_url || null,
          sourceSnippet: t.source_snippet || null, starId: t.star_id || null, status: t.status,
          triggerSource: t.trigger_source || null, prevApiTotal: t.prev_api_total != null ? Number(t.prev_api_total) : null,
          brandId: t.brand_id || null,
        };
      });
    },
    enabled: !!watchedStarIds && watchedStarIds.length > 0,
    staleTime: 60_000,
  });

  const { data: isCollecting = false } = useQuery({
    queryKey: ["t2-pipeline-running"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ktrenz_pipeline_state" as any)
        .select("id")
        .in("status", ["running", "postprocess_requested", "postprocess_running"])
        .limit(1);
      return ((data as any[])?.length ?? 0) > 0;
    },
    refetchInterval: 30000,
    staleTime: 20000,
  });

  const followedKey = (followedTriggerIds ?? []).slice().sort().join(",");
  const predictedKey = (predictedTriggerIds ?? []).slice().sort().join(",");

  const { data: triggers, isLoading } = useQuery({
    queryKey: ["t2-trend-triggers", followedKey, predictedKey],
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    enabled: true,
    queryFn: async () => {
      const basePromise = supabase
        .from("ktrenz_trend_triggers" as any)
        .select("*")
        .eq("status", "active")
        .order("influence_index", { ascending: false })
        .order("baseline_score", { ascending: false })
        .order("detected_at", { ascending: false })
        .limit(500);

      const followedPromise = followedTriggerIds && followedTriggerIds.length > 0
        ? supabase
            .from("ktrenz_trend_triggers" as any)
            .select("*")
            .eq("status", "active")
            .in("id", followedTriggerIds)
        : Promise.resolve({ data: [] as any[] });

      const predictedPromise = predictedTriggerIds && predictedTriggerIds.length > 0
        ? supabase
            .from("ktrenz_trend_triggers" as any)
            .select("*")
            .eq("status", "active")
            .in("id", predictedTriggerIds)
        : Promise.resolve({ data: [] as any[] });

      const [{ data: baseData }, { data: followedData }, { data: predictedData }] = await Promise.all([
        basePromise,
        followedPromise,
        predictedPromise,
      ]);

      const mergedRaw = new Map<string, any>();
      [...(baseData ?? []), ...(followedData ?? []), ...(predictedData ?? [])].forEach((item: any) => {
        mergedRaw.set(item.id, item);
      });
      const rawTriggers = Array.from(mergedRaw.values()) as any[];

      const starIds = [...new Set(rawTriggers.map((t: any) => t.star_id).filter(Boolean))];
      const starMap = new Map<string, { display_name: string; name_ko: string | null; image_url: string | null; wiki_entry_id: string | null }>();
      const activeStarIds = new Set<string>();
      if (starIds.length > 0) {
        const { data: stars } = await supabase
          .from("ktrenz_stars" as any)
          .select("id, wiki_entry_id, display_name, name_ko, is_active, group_star_id, image_url")
          .in("id", starIds);

        const activeStars = (stars ?? []).filter((s: any) => s.is_active !== false);
        activeStars.forEach((s: any) => activeStarIds.add(s.id));

        const wikiIds = new Set<string>();
        const groupStarIds = new Set<string>();
        activeStars.forEach((s: any) => {
          if (s.wiki_entry_id) wikiIds.add(s.wiki_entry_id);
          if (s.group_star_id) groupStarIds.add(s.group_star_id);
        });

        const groupWikiMap = new Map<string, string>();
        if (groupStarIds.size > 0) {
          const { data: groupStars } = await supabase.from("ktrenz_stars").select("id, wiki_entry_id").in("id", Array.from(groupStarIds));
          (groupStars ?? []).forEach((g: any) => {
            if (g.wiki_entry_id) {
              groupWikiMap.set(g.id, g.wiki_entry_id);
              wikiIds.add(g.wiki_entry_id);
            }
          });
        }

        const imageMap = new Map<string, string>();
        if (wikiIds.size > 0) {
          const { data: wikiEntries } = await supabase.from("wiki_entries").select("id, image_url").in("id", Array.from(wikiIds));
          (wikiEntries ?? []).forEach((w: any) => {
            if (w.image_url) imageMap.set(w.id, w.image_url);
          });
        }

        activeStars.forEach((s: any) => {
          const ownImage = s.wiki_entry_id ? imageMap.get(s.wiki_entry_id) : null;
          const groupWikiId = s.group_star_id ? groupWikiMap.get(s.group_star_id) : null;
          const groupImage = groupWikiId ? imageMap.get(groupWikiId) : null;
          const starDirectImage = s.image_url && s.image_url !== "" ? s.image_url : null;
          starMap.set(s.id, {
            display_name: s.display_name,
            name_ko: s.name_ko,
            image_url: (ownImage && !isBlockedImageDomain(ownImage) ? ownImage : null)
              || (starDirectImage && !isBlockedImageDomain(starDirectImage) ? starDirectImage : null)
              || (groupImage && !isBlockedImageDomain(groupImage) ? groupImage : null)
              || null,
            wiki_entry_id: s.wiki_entry_id || groupWikiId,
          });
        });
      }

      const filteredTriggers = rawTriggers.filter((t: any) => !t.star_id || activeStarIds.has(t.star_id));

      return filteredTriggers.map((t: any): TrendTile => {
        const star = t.star_id ? starMap.get(t.star_id) : null;
        return {
          id: t.id,
          keyword: t.keyword,
          keywordKo: t.keyword_ko || null,
          keywordJa: t.keyword_ja || null,
          keywordZh: t.keyword_zh || null,
          category: t.keyword_category || "brand",
          artistName: star?.display_name || t.artist_name || "Unknown",
          artistNameKo: star?.name_ko || null,
          artistImageUrl: star?.image_url || null,
          wikiEntryId: star?.wiki_entry_id || t.wiki_entry_id,
          influenceIndex: Number(t.influence_index) || 0,
          context: t.context,
          contextKo: t.context_ko || null,
          contextJa: t.context_ja || null,
          contextZh: t.context_zh || null,
          detectedAt: t.detected_at,
          peakAt: t.peak_at || null,
          expiredAt: t.expired_at || null,
          lifetimeHours: t.lifetime_hours != null ? Number(t.lifetime_hours) : null,
          peakDelayHours: t.peak_delay_hours != null ? Number(t.peak_delay_hours) : null,
          baselineScore: t.baseline_score != null ? Number(t.baseline_score) : null,
          peakScore: t.peak_score != null ? Number(t.peak_score) : null,
          sourceUrl: t.source_url || null,
          sourceTitle: t.source_title || null,
          sourceImageUrl: t.source_image_url || null,
          sourceSnippet: t.source_snippet || null,
          starId: t.star_id || null,
          status: t.status,
          triggerSource: t.trigger_source || null,
          prevApiTotal: t.prev_api_total != null ? Number(t.prev_api_total) : null,
          brandId: t.brand_id || null,
        };
      });
    },
    refetchInterval: 30 * 60 * 1000,
  });

  const dedupedShopTriggers = useMemo(() => {
    if (!triggers?.length) return [];
    return dedupeTrendTiles(triggers.filter(t => t.category === "shopping"), sortMode);
  }, [triggers, sortMode]);

  const dedupedTriggers = useMemo(() => {
    if (!triggers?.length) return [];
    return dedupeTrendTiles(triggers, sortMode);
  }, [triggers, sortMode]);

  const myKeywords = useMemo(() => {
    if (!triggers?.length) return [];

    const watchedKeywords = triggers.filter(
      (t) => t.starId ? watchedStarSet.has(t.starId) : false
    );
    const trackedKeywords = triggers.filter((t) => followedTriggerSet.has(t.id));
    const predictedKeywords = triggers.filter((t) => predictedTriggerSet.has(t.id));

    const merged = new Map<string, TrendTile>();
    [...watchedKeywords, ...(watchedTriggerTiles ?? []), ...trackedKeywords, ...predictedKeywords].forEach((item) => {
      merged.set(item.id, item);
    });

    return Array.from(merged.values()).sort((a, b) => compareTrendPriority(a, b, sortMode));
  }, [triggers, watchedStarSet, watchedTriggerTiles, followedTriggerSet, predictedTriggerSet, sortMode]);

  const filteredItems = useMemo(() => {
    // If mergedCategories provided, filter by multiple categories
    if (mergedCategories && mergedCategories.length > 0) {
      return dedupedTriggers.filter(t => mergedCategories.includes(t.category));
    }
    if (selectedCategory === "shopping") {
      return dedupedShopTriggers;
    }
    if (!dedupedTriggers.length) return [];
    if (selectedCategory === "my") {
      return myKeywords;
    }
    if (selectedCategory === "all") {
      return dedupedTriggers.filter(t => t.category !== "music");
    }
    return dedupedTriggers.filter(t => t.category === selectedCategory);
  }, [dedupedTriggers, selectedCategory, followedTriggerSet, mergedCategories, myKeywords, dedupedShopTriggers]);

  const visibleBoxItems = useMemo(() => {
    // Treemap: prefer 1 keyword per artist, but fill up to 60 with extras if needed
    const TARGET = 60;
    const artistCount = new Map<string, number>();
    const deduped: typeof filteredItems = [];

    // Pass 1: pick top keyword per artist
    for (const item of filteredItems) {
      if (deduped.length >= TARGET) break;
      const count = artistCount.get(item.wikiEntryId) ?? 0;
      if (count === 0) {
        artistCount.set(item.wikiEntryId, 1);
        deduped.push(item);
      }
    }

    // Pass 2: fill remaining slots with next-best keywords (allow duplicates)
    if (deduped.length < TARGET) {
      for (const item of filteredItems) {
        if (deduped.length >= TARGET) break;
        const count = artistCount.get(item.wikiEntryId) ?? 0;
        if (count >= 1 && !deduped.includes(item)) {
          artistCount.set(item.wikiEntryId, count + 1);
          deduped.push(item);
        }
      }
    }

    // Re-sort after both passes so rank-based multiplier matches actual score order
    deduped.sort((a, b) => compareTrendPriority(a, b, sortMode));

    return deduped;
  }, [filteredItems]);

  // Fetch real tracking history for carousel sparklines
  const carouselIds = useMemo(() => filteredItems.slice(0, 90).map(i => i.id).join(","), [filteredItems]);
  const { data: carouselTrackingMap } = useQuery({
    queryKey: ["carousel-tracking", carouselIds],
    enabled: filteredItems.length > 0,
    queryFn: async () => {
      const ids = filteredItems.slice(0, 90).map(i => i.id);
      const allData: any[] = [];
      for (let i = 0; i < ids.length; i += 30) {
        const batch = ids.slice(i, i + 30);
        const { data } = await supabase
          .from("ktrenz_trend_tracking" as any)
          .select("trigger_id, tracked_at, interest_score")
          .in("trigger_id", batch)
          .order("tracked_at", { ascending: true });
        if (data) allData.push(...(data as any[]));
      }
      const map = new Map<string, any[]>();
      allData.forEach((d: any) => {
        const arr = map.get(d.trigger_id) || [];
        arr.push(d);
        map.set(d.trigger_id, arr);
      });
      return map;
    },
    staleTime: 1000 * 60 * 5,
  });

  const containerWidth = isMobile ? 390 : 1000;
  const containerHeight = useMemo(() => {
    if (currentViewMode !== "treemap") return isMobile ? 1200 : 1800;

    return isMobile ? 3200 : 2800;
  }, [currentViewMode, isMobile]);

  const [listVisibleCount, setListVisibleCount] = useState(20);

  // Reset list visible count when category changes
  useEffect(() => {
    setListVisibleCount(20);
  }, [selectedCategory]);

  const visibleListItems = useMemo(() => {
    return filteredItems.slice(0, listVisibleCount);
  }, [filteredItems, listVisibleCount]);

  const hasMoreList = filteredItems.length > listVisibleCount;

  const rects = useMemo(() => {
    if (!visibleBoxItems.length) return [];
    return squarify(visibleBoxItems, 0, 0, containerWidth, containerHeight, sortMode, isCollecting);
  }, [visibleBoxItems, containerWidth, containerHeight, sortMode, isCollecting]);

  useEffect(() => {
    const modalId = searchParams.get("modal");
    if (!modalId || !filteredItems.length) {
      setSelectedTile(null);
      return;
    }
    // Try filtered first, then fall back to all triggers (for related keywords from other categories)
    const found = filteredItems.find((item) => item.id === modalId)
      ?? dedupedTriggers.find((item) => item.id === modalId)
      ?? null;
    setSelectedTile(found);
  }, [filteredItems, dedupedTriggers, searchParams]);

  const track = useTrackEvent();
  const handleTileClick = useCallback((item: TrendTile) => {
    const nextParams = new URLSearchParams(searchParams);
    if (selectedTile?.id === item.id) {
      nextParams.delete("modal");
    } else {
      nextParams.set("modal", item.id);
      track("t2_treemap_click", { artist_name: item.artistName, artist_slug: item.wikiEntryId, category: item.category, section: item.keyword });
    }
    setSearchParams(nextParams);
  }, [searchParams, selectedTile?.id, setSearchParams, track]);

  const categoryStats = useMemo(() => {
    const stats: Record<string, number> = {};
    for (const t of dedupedTriggers) {
      stats[t.category] = (stats[t.category] || 0) + 1;
    }
    stats["shopping"] = dedupedShopTriggers.length;
    return stats;
  }, [dedupedTriggers, dedupedShopTriggers]);

  useEffect(() => {
    if (onCategoryStatsChange && dedupedTriggers.length > 0) {
      const allCount = dedupedTriggers.filter(t => t.category !== "music").length;
      onCategoryStatsChange(categoryStats, allCount, myKeywords.length);
    }
  }, [categoryStats, dedupedTriggers.length, myKeywords.length, onCategoryStatsChange]);

  useEffect(() => {
    if (onMyKeywordsChange) onMyKeywordsChange(myKeywords);
  }, [myKeywords, onMyKeywordsChange]);

  if (isLoading) {
    return (
      <div className="px-4 pb-4">
        <div className="pt-4 pb-3">
          <Skeleton className="h-7 w-48 mb-1" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex gap-2 mb-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-7 w-16 rounded-full" />)}
        </div>
        <Skeleton className="w-full rounded-2xl" style={{ aspectRatio: `${containerWidth} / ${containerHeight}` }} />
      </div>
    );
  }

  return (
    <div className={cn("px-0 md:px-4", currentViewMode === "treemap" ? "pb-0" : "pb-4")}>
      {/* Header — hidden: title/hot/trend sort buttons
      {!hideHeader && (
      <div className="pt-4 pb-3 flex items-center justify-between gap-3 px-4 md:px-0">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-extrabold text-muted-foreground">{t("trend.spectrumTitle")}</h2>
          {isAdmin && <T2AdminControls />}
        </div>
        <div className="flex items-center gap-1 bg-muted/50 rounded-full p-0.5">
          <button
            onClick={() => setSortMode("rate")}
            className={cn(
              "min-w-[60px] px-3 py-1.5 rounded-full text-xs font-bold transition-all",
              sortMode === "rate" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Hot
          </button>
          <button
            onClick={() => setSortMode("volume")}
            className={cn(
              "min-w-[60px] px-3 py-1.5 rounded-full text-xs font-bold transition-all",
              sortMode === "volume" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Trend
          </button>
        </div>
      </div>
      )}
      */}

      {!hideCategory && (
      <div className={cn(
        "flex items-center gap-2 mb-3 overflow-x-auto pb-1 scrollbar-hide",
        "sticky top-14 z-30 bg-card/85 backdrop-blur-md pt-3 pb-2 -mx-4 px-4"
      )}>
        {ALL_CATEGORIES.map((cat) => {
          const isActive = selectedCategory === cat;
          const config = cat === "all" || cat === "my" ? null : CATEGORY_CONFIG[cat];
          const allCount = cat === "all"
            ? dedupedTriggers.filter(t => t.category !== "music").length
            : cat === "my"
            ? myKeywords.length
            : categoryStats[cat] || 0;
          return (
            <button
              key={cat}
              onClick={() => { setSelectedCategory(cat); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              className={cn(
                "flex items-center gap-1.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all border",
                cat === "all" ? "px-5" : "px-3",
                isActive && "shadow-sm"
              )}
              style={{
                backgroundColor: isActive
                  ? (cat === "my" ? "hsl(45, 90%, 50%)" : config?.color ?? "hsl(var(--primary))")
                  : "hsl(var(--muted) / 0.5)",
                color: isActive ? "#fff" : "hsl(220, 10%, 55%)",
                borderColor: isActive
                  ? "transparent"
                  : cat === "all"
                    ? "hsl(var(--border))"
                    : cat === "my"
                    ? "hsla(45, 90%, 50%, 0.3)"
                    : config?.color ? `${config.color.replace(")", ", 0.3)").replace("hsl(", "hsla(")}` : "hsl(var(--border))",
              }}
            >
              {cat === "all" ? "All" : cat === "my" ? "★ My" : config?.label}
              <span
                className="text-[10px] text-muted-foreground/60"
              >
                {allCount}
              </span>
            </button>
          );
        })}
      </div>
      )}

      {/* View Content */}
      <div>
      {filteredItems.length === 0 ? (
        <div className="rounded-2xl border border-border bg-muted/20 flex items-center justify-center py-20">
          <p className="text-sm text-muted-foreground">No active trend keywords detected yet.</p>
        </div>
      ) : currentViewMode === "artist" ? (
        <T2ArtistList
          items={filteredItems}
        watchedStarSet={watchedStarSet}
        />
      ) : currentViewMode === "list" ? (
        <T2TrendList
          items={visibleListItems}
          watchedStarSet={watchedStarSet}
          onTileClick={handleTileClick}
          selectedTileId={selectedTile?.id ?? null}
          hasMore={hasMoreList}
          onLoadMore={() => setListVisibleCount(prev => prev + 20)}
          gridMode={gridMode}
        />
      ) : (
        <div className="px-0 md:px-0 space-y-6">
          {/* Top 5 Featured Cards */}
          <T2TopCards
            items={dedupedTriggers.filter(t => t.category !== "music")}
            onTileClick={handleTileClick}
            trackingMap={carouselTrackingMap}
          />

          {/* Carousel Card View — grouped by category */}
          {(() => {
            // Group items by merged categories
            const mergeMap: Record<string, string> = {
              brand: "brand_product", product: "brand_product",
              beauty: "beauty_fashion", fashion: "beauty_fashion",
              event: "event_social", social: "event_social",
              music: "music_media", media: "music_media",
            };
            const grouped = new Map<string, TrendTile[]>();
            for (const item of filteredItems) {
              const cat = mergeMap[item.category] || item.category;
              const list = grouped.get(cat) || [];
              list.push(item);
              grouped.set(cat, list);
            }

            const myItems = myKeywords.length > 0 ? myKeywords : [];
            const sectionDefs: { key: string; label: string; color: string }[] = [
              { key: "brand_product", label: "Brand · Product", color: CATEGORY_CONFIG.brand.color },
              { key: "beauty_fashion", label: "Beauty · Fashion", color: CATEGORY_CONFIG.beauty.color },
              { key: "place", label: "Place", color: CATEGORY_CONFIG.place.color },
              { key: "food", label: "Food", color: CATEGORY_CONFIG.food.color },
              { key: "event_social", label: "Event · Social", color: CATEGORY_CONFIG.event.color },
              { key: "music_media", label: "Music · Media", color: CATEGORY_CONFIG.music.color },
            ];

            const sectionOrder = [
              // My Picks is now shown in the hero section above
              ...sectionDefs
                .filter(s => (grouped.get(s.key)?.length ?? 0) > 0)
                .map(s => ({ ...s, items: grouped.get(s.key)! })),
            ];

            return sectionOrder.map(({ key, label, color, items }) => {

                return (
                  <div key={key}>
                    {/* Section header */}
                    <div
                      className="flex items-center gap-1.5 mb-3 cursor-pointer group pl-4"
                      onClick={() => navigate(`/t2/category/${key}`)}
                    >
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <h3 className="text-base font-medium text-foreground flex-1">{label}</h3>
                      <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </div>

                    {/* Horizontal carousel */}
                    <div
                      className="flex items-start gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide"
                      style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}
                    >
                      {items.slice(0, 20).map((item, idx) => {
                        const rawSourceImg = sanitizeImageUrl((item.sourceImageUrl?.startsWith('https://') || item.sourceImageUrl?.startsWith('http://')) ? item.sourceImageUrl : null);
                        const safeSourceImg = rawSourceImg && !isBlockedImageDomain(rawSourceImg) ? rawSourceImg : null;
                        const platformLogo = detectPlatformLogo(item.sourceUrl, item.sourceImageUrl);
                        const bgImg = safeSourceImg || item.artistImageUrl || platformLogo;
                        const isMyArtist = item.starId ? watchedStarSet.has(item.starId) : false;
                        const isSelected = selectedTile?.id === item.id;

                        const delta = sortMode === "volume"
                          ? (() => {
                              const current = item.prevApiTotal ?? item.peakScore ?? 0;
                              const base = item.baselineScore ?? 0;
                              return current - base;
                            })()
                          : null;

                        return (
                          <button
                            key={item.id}
                            onClick={() => handleTileClick(item)}
                            className={cn(
                              "flex-none snap-start rounded-2xl border overflow-hidden flex flex-col text-left transition-colors",
                              idx === 0 ? "w-[280px] md:w-[320px]" : "w-[260px] md:w-[280px]",
                              isSelected
                                ? "border-primary/50 ring-2 ring-primary/20 bg-card"
                                : "border-border/30 bg-card/60 hover:bg-card/90 hover:border-border/50"
                            )}
                          >
                            {/* Top: keyword + artist + sparkline */}
                            <div className={cn("flex flex-col gap-1", idx === 0 ? "p-4 pb-2" : "p-3 pb-2")}>
                              <div className="flex items-center justify-between">
                                <span className={cn("font-medium text-muted-foreground truncate", idx === 0 ? "text-sm" : "text-xs")}>
                                  {getLocalizedArtistName(item, language)}
                                </span>
                                <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground shrink-0">
                                  <Clock className="w-2.5 h-2.5" />
                                  {formatAge(item.detectedAt)}
                                </span>
                              </div>
                              <div className="flex items-start gap-1.5">
                                <MessageCircle className="w-3.5 h-3.5 shrink-0 -scale-x-100 mt-[3px]" style={{ color: CATEGORY_CONFIG[item.category]?.color || "hsl(var(--primary))" }} />
                                <h4 className={cn("font-black text-foreground line-clamp-2 leading-snug", idx === 0 ? "text-lg" : "text-base")}>
                                  {getLocalizedKeyword(item, language)}
                                </h4>
                              </div>
                            </div>
                            {/* Image area with rank badge + sparkline overlay */}
                            <div className={cn("relative w-full bg-muted/30 overflow-hidden min-h-0", idx === 0 ? "h-[300px]" : "h-[280px]")}>
                              {bgImg ? (
                                <img src={bgImg} alt={getLocalizedKeyword(item, language)} className="w-full h-full object-cover object-center" loading="lazy" referrerPolicy="no-referrer" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center font-black text-white/20" style={{ backgroundColor: CATEGORY_CONFIG[item.category]?.tileColor || "hsl(var(--muted))", fontSize: idx === 0 ? "56px" : "40px" }}>
                                  {getLocalizedArtistName(item, language).charAt(0)}
                                </div>
                              )}
                              {idx < 3 && (
                                <span className={cn("absolute top-2 left-2 rounded-full bg-black/60 backdrop-blur-sm text-white font-black flex items-center justify-center", idx === 0 ? "w-8 h-8 text-sm" : "w-6 h-6 text-[10px]")}>
                                  {idx + 1}
                                </span>
                              )}
                              {isMyArtist && (
                                <Star className="w-4 h-4 text-amber-400 fill-amber-400 absolute top-2 right-2 drop-shadow-md" />
                              )}
                              {/* Sparkline overlay at bottom of image */}
                              <div className="absolute inset-x-0 bottom-0">
                                <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/80 via-black/45 to-transparent" />
                                <div className="relative pb-4 pt-4">
                                  <svg viewBox="0 0 100 20" className="w-full h-[20px]" preserveAspectRatio="none">
                                    <defs>
                                      <linearGradient id={`cat-spark-${item.id}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={CATEGORY_CONFIG[item.category]?.color || "hsl(var(--primary))"} stopOpacity="0.7" />
                                        <stop offset="100%" stopColor={CATEGORY_CONFIG[item.category]?.color || "hsl(var(--primary))"} stopOpacity="0.12" />
                                      </linearGradient>
                                    </defs>
                                    {(() => {
                                      const history = carouselTrackingMap?.get(item.id) ?? [];
                                      const nowMs = Date.now();
                                      let pts: { t: number; v: number }[] = [];
                                      if (history.length >= 2) {
                                        pts = history.map((h: any) => ({ t: new Date(h.tracked_at).getTime(), v: Number(h.interest_score ?? 0) }));
                                      } else if (history.length === 1) {
                                        pts = [
                                          { t: new Date(item.detectedAt).getTime(), v: Number(item.baselineScore ?? 0) },
                                          { t: new Date(history[0].tracked_at).getTime(), v: Number(history[0].interest_score ?? 0) },
                                        ];
                                      } else {
                                        const detMs = new Date(item.detectedAt).getTime();
                                        const bv = Number(item.baselineScore ?? 0);
                                        pts = [{ t: detMs, v: bv }, { t: nowMs, v: bv }];
                                      }
                                      if (pts.length < 2) return null;
                                      const lastPt = pts[pts.length - 1];
                                      if (lastPt.t < nowMs) {
                                        pts = [...pts, { t: nowMs, v: lastPt.v }];
                                      } else if (lastPt.t > nowMs) {
                                        pts[pts.length - 1] = { ...lastPt, t: nowMs };
                                      }
                                      const startMs = Math.min(pts[0].t, nowMs);
                                      const spanMs = Math.max(nowMs - startMs, 3600000);
                                      const vals = pts.map(p => p.v);
                                      const minVal = Math.min(...vals);
                                      const maxVal = Math.max(...vals, 1);
                                      const range = maxVal - minVal;
                                      // If range is tiny relative to max (<5%), amplify to show variation
                                      const effectiveMin = range < maxVal * 0.05 ? maxVal * 0.8 : minVal;
                                      const effectiveRange = maxVal - effectiveMin || 1;
                                      const toX = (t: number, index: number) => {
                                        if (index === pts.length - 1) return 100;
                                        return Math.max(0, Math.min(((t - startMs) / spanMs) * 100, 100));
                                      };
                                      const toY = (v: number) => {
                                        const normalized = Math.max(0, Math.min((v - effectiveMin) / effectiveRange, 1));
                                        return 18 - normalized * 14;
                                      };
                                      const catColor = CATEGORY_CONFIG[item.category]?.color || "hsl(var(--primary))";
                                      const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${toX(p.t, i).toFixed(1)},${toY(p.v).toFixed(1)}`).join(" ");
                                      return (
                                        <>
                                          <path d={`${path} L100,20 L0,20 Z`} fill={`url(#cat-spark-${item.id})`} />
                                          <path d={path} fill="none" stroke={catColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" />
                                        </>
                                      );
                                    })()}
                                  </svg>
                                  {(() => {
                                    const history = carouselTrackingMap?.get(item.id) ?? [];
                                    const startMs = history.length >= 1
                                      ? new Date(history[0].tracked_at).getTime()
                                      : new Date(item.detectedAt).getTime();
                                    const nowMs = Date.now();
                                    const spanMs = Math.max(nowMs - startMs, 3600000);
                                    const totalH = Math.round(spanMs / 3600000);
                                    const fmtH = (h: number) => h >= 24 ? `${Math.round(h / 24)}d` : `${Math.round(h)}h`;
                                    return (
                                      <div className="absolute bottom-1.5 left-3 right-3 flex justify-between text-[7px] font-medium text-white/50 drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]">
                                        <span>{fmtH(0)}</span>
                                        <span>{fmtH(Math.round(totalH * 0.25))}</span>
                                        <span>{fmtH(Math.round(totalH * 0.5))}</span>
                                        <span>{fmtH(Math.round(totalH * 0.75))}</span>
                                        <span>now</span>
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              });
          })()}
        </div>
      )}
      </div>


      {/* Detail Sheet */}
      <T2DetailSheet
        tile={selectedTile}
        rank={selectedTile ? filteredItems.findIndex(t => t.id === selectedTile.id) + 1 : undefined}
        totalCount={filteredItems.length}
        onClose={() => {
          const nextParams = new URLSearchParams(searchParams);
          nextParams.delete("modal");
          setSearchParams(nextParams);
        }}
      />
    </div>
  );
};

export default T2TrendTreemap;
