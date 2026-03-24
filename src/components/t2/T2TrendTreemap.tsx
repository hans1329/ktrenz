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
import { TrendingUp, Clock, Star, ChevronRight, LayoutGrid, List, Users, MoreVertical, Zap, Database } from "lucide-react";
import T2DetailSheet from "./T2DetailSheet";
import BoxParticles from "@/components/v3/BoxParticles";
import T2AdminControls from "./T2AdminControls";
import T2TrendList from "./T2TrendList";
import T2ArtistList from "./T2ArtistList";

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
  prevApiTotal: number | null;
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
      <Star className="w-4 h-4 text-amber-500 fill-amber-500 shrink-0" />
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
const T2TrendTreemap = ({ viewMode, onViewModeChange, selectedCategory: externalCategory, onCategoryChange, hideCategory, hideHeader, onCategoryStatsChange, sortMode: externalSortMode, onSortModeChange }: { viewMode?: "treemap" | "list" | "artist"; onViewModeChange?: (mode: "treemap" | "list" | "artist") => void; selectedCategory?: TrendCategory; onCategoryChange?: (cat: TrendCategory) => void; hideCategory?: boolean; hideHeader?: boolean; onCategoryStatsChange?: (stats: Record<string, number>, total: number, myCount: number) => void; sortMode?: SortMode; onSortModeChange?: (mode: SortMode) => void }) => {
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
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const navigate = useNavigate();

  // Fetch user's watched artists (including group members)
  const { data: watchedWikiIds } = useQuery({
    queryKey: ["t2-watched-artists", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      // 1. Get user's agent slots
      const { data: slots } = await supabase
        .from("ktrenz_agent_slots")
        .select("wiki_entry_id")
        .eq("user_id", user.id)
        .not("wiki_entry_id", "is", null);
      const directIds = (slots ?? []).map((d: any) => d.wiki_entry_id).filter(Boolean) as string[];
      if (!directIds.length) return [];

      // 2. Find star_ids for these wiki_entry_ids (to check if any are groups)
      const { data: stars } = await supabase
        .from("ktrenz_stars" as any)
        .select("id, wiki_entry_id")
        .in("wiki_entry_id", directIds);
      const starIds = (stars ?? []).map((s: any) => s.id) as string[];

      // 3. Find members whose group_star_id matches any of these star_ids
      if (starIds.length) {
        const { data: members } = await supabase
          .from("ktrenz_stars" as any)
          .select("wiki_entry_id")
          .in("group_star_id", starIds)
          .not("wiki_entry_id", "is", null);
        const memberIds = (members ?? []).map((m: any) => m.wiki_entry_id).filter(Boolean) as string[];
        return [...new Set([...directIds, ...memberIds])];
      }

      return directIds;
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  const watchedSet = useMemo(() => new Set(watchedWikiIds ?? []), [watchedWikiIds]);

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

  const { data: triggers, isLoading } = useQuery({
    queryKey: ["t2-trend-triggers"],
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    queryFn: async () => {
      // Fetch triggers
      const { data } = await supabase
        .from("ktrenz_trend_triggers" as any)
        .select("*")
        .eq("status", "active")
        .neq("trigger_source", "naver_shop")
        .order("influence_index", { ascending: false })
        .order("baseline_score", { ascending: false })
        .order("detected_at", { ascending: false })
        .limit(500);

      const triggers = (data ?? []) as any[];

      // Fetch star info using star_id from ktrenz_stars (only active stars)
      const starIds = [...new Set(triggers.map((t: any) => t.star_id).filter(Boolean))];
      const starMap = new Map<string, { display_name: string; name_ko: string | null; image_url: string | null; wiki_entry_id: string | null }>();
      const activeStarIds = new Set<string>();
      if (starIds.length > 0) {
        const { data: stars } = await supabase
          .from("ktrenz_stars" as any)
          .select("id, wiki_entry_id, display_name, name_ko, is_active, group_star_id, image_url")
          .in("id", starIds);
        
        // Only include active stars
        const activeStars = (stars ?? []).filter((s: any) => s.is_active !== false);
        activeStars.forEach((s: any) => activeStarIds.add(s.id));

        // Collect wiki_entry_ids from both the star itself and its group parent
        const wikiIds = new Set<string>();
        const groupStarIds = new Set<string>();
        activeStars.forEach((s: any) => {
          if (s.wiki_entry_id) wikiIds.add(s.wiki_entry_id);
          if (s.group_star_id) groupStarIds.add(s.group_star_id);
        });
        // Also fetch group stars' wiki_entry_ids for fallback images
        const groupWikiMap = new Map<string, string>(); // group_star_id -> wiki_entry_id
        if (groupStarIds.size > 0) {
          const { data: groupStars } = await supabase.from("ktrenz_stars").select("id, wiki_entry_id").in("id", Array.from(groupStarIds));
          (groupStars ?? []).forEach((g: any) => {
            if (g.wiki_entry_id) { groupWikiMap.set(g.id, g.wiki_entry_id); wikiIds.add(g.wiki_entry_id); }
          });
        }
        const imageMap = new Map<string, string>();
        if (wikiIds.size > 0) {
          const { data: wikiEntries } = await supabase.from("wiki_entries").select("id, image_url").in("id", Array.from(wikiIds));
          (wikiEntries ?? []).forEach((w: any) => { if (w.image_url) imageMap.set(w.id, w.image_url); });
        }
        activeStars.forEach((s: any) => {
          const ownImage = s.wiki_entry_id ? imageMap.get(s.wiki_entry_id) : null;
          const groupWikiId = s.group_star_id ? groupWikiMap.get(s.group_star_id) : null;
          const groupImage = groupWikiId ? imageMap.get(groupWikiId) : null;
          const starDirectImage = s.image_url && s.image_url !== "" ? s.image_url : null;
          starMap.set(s.id, { display_name: s.display_name, name_ko: s.name_ko, image_url: ownImage || starDirectImage || groupImage || null, wiki_entry_id: s.wiki_entry_id || groupWikiId });
        });
      }

      // Filter out triggers whose star_id is not in active stars
      const filteredTriggers = triggers.filter((t: any) => !t.star_id || activeStarIds.has(t.star_id));

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
          prevApiTotal: t.prev_api_total != null ? Number(t.prev_api_total) : null,
        };
      });
    },
    refetchInterval: 30 * 60 * 1000,
  });

  // Separate query for shopping (naver_shop) triggers
  const { data: shopTriggers } = useQuery({
    queryKey: ["t2-trend-triggers-shopping"],
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("ktrenz_trend_triggers" as any)
        .select("id, keyword, keyword_ko, keyword_ja, keyword_zh, keyword_category, artist_name, star_id, wiki_entry_id, influence_index, context, context_ko, context_ja, context_zh, detected_at, peak_at, expired_at, lifetime_hours, peak_delay_hours, baseline_score, peak_score, source_url, source_title, source_image_url, source_snippet, status")
        .eq("status", "active")
        .eq("trigger_source", "naver_shop")
        .order("influence_index", { ascending: false })
        .limit(200);

      return ((data ?? []) as any[]).map((t: any): TrendTile => ({
        id: t.id,
        keyword: t.keyword,
        keywordKo: t.keyword_ko || null,
        keywordJa: t.keyword_ja || null,
        keywordZh: t.keyword_zh || null,
        category: "shopping",
        artistName: t.artist_name || "Unknown",
        artistNameKo: null,
        artistImageUrl: null,
        wikiEntryId: t.wiki_entry_id || "",
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
        prevApiTotal: t.prev_api_total != null ? Number(t.prev_api_total) : null,
      }));
    },
  });

  const dedupedShopTriggers = useMemo(() => {
    if (!shopTriggers?.length) return [];
    return dedupeTrendTiles(shopTriggers, sortMode);
  }, [shopTriggers, sortMode]);

  const dedupedTriggers = useMemo(() => {
    if (!triggers?.length) return [];
    return dedupeTrendTiles(triggers, sortMode);
  }, [triggers, sortMode]);

  // My artists' keywords
  const myKeywords = useMemo(() => {
    if (!dedupedTriggers.length || !watchedSet.size) return [];
    return dedupedTriggers.filter(t => watchedSet.has(t.wikiEntryId));
  }, [dedupedTriggers, watchedSet]);

  const filteredItems = useMemo(() => {
    if (selectedCategory === "shopping") {
      return dedupedShopTriggers;
    }
    if (!dedupedTriggers.length) return [];
    if (selectedCategory === "my") {
      return dedupedTriggers.filter(t => watchedSet.has(t.wikiEntryId));
    }
    if (selectedCategory === "all") {
      return dedupedTriggers.filter(t => t.category !== "music");
    }
    return dedupedTriggers.filter(t => t.category === selectedCategory);
  }, [dedupedTriggers, selectedCategory, watchedSet]);

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
      {/* Header */}
      {!hideHeader && (
      <div className="pt-4 pb-3 flex items-center justify-between gap-3 px-4 md:px-0">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-extrabold text-muted-foreground">{t("trend.spectrumTitle")}</h2>
          {isAdmin && isMobile && (
            <div className="relative">
              <button onClick={() => setAdminMenuOpen(v => !v)}
                className="p-1.5 rounded-full text-muted-foreground hover:bg-muted transition-colors">
                <MoreVertical className="w-4 h-4" />
              </button>
              {adminMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setAdminMenuOpen(false)} />
                  <div className="absolute left-0 top-full mt-1 z-50 bg-background border border-border rounded-xl shadow-lg p-3 min-w-[220px]">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 px-1">Admin Tools</p>
                    <T2AdminControls />
                    <div className="border-t border-border mt-2 pt-2">
                      <button onClick={() => { navigate("/admin"); setAdminMenuOpen(false); }}
                        className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                        <Zap className="w-3 h-3" /> 관리자 대시보드
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          {isAdmin && !isMobile && <T2AdminControls />}
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
          watchedSet={watchedSet}
        />
      ) : currentViewMode === "list" ? (
        <T2TrendList
          items={visibleListItems}
          watchedSet={watchedSet}
          onTileClick={handleTileClick}
          selectedTileId={selectedTile?.id ?? null}
          hasMore={hasMoreList}
          onLoadMore={() => setListVisibleCount(prev => prev + 20)}
        />
      ) : (
        <div className="px-4 md:px-0 space-y-6">
          {/* Carousel Card View — grouped by category */}
          {(() => {
            // Group items by category, merging brand+product
            const grouped = new Map<string, TrendTile[]>();
            for (const item of filteredItems) {
              const cat = (item.category === "brand" || item.category === "product") ? "brand_product" : item.category;
              const list = grouped.get(cat) || [];
              list.push(item);
              grouped.set(cat, list);
            }

            // My artists section first, then merged brand+product, then rest
            const myItems = myKeywords.length > 0 ? myKeywords : [];
            const sectionOrder = [
              ...(myItems.length > 0 ? [{ key: "my", label: "★ My Picks", color: "hsl(45, 90%, 50%)", items: myItems }] : []),
              ...(grouped.has("brand_product") ? [{ key: "brand_product", label: "Brand · Product", color: CATEGORY_CONFIG.brand.color, items: grouped.get("brand_product")! }] : []),
              ...Object.keys(CATEGORY_CONFIG)
                .filter(cat => cat !== "shopping" && cat !== "brand" && cat !== "product")
                .filter(cat => (grouped.get(cat)?.length ?? 0) > 0)
                .map(cat => ({ key: cat, label: CATEGORY_CONFIG[cat].label, color: CATEGORY_CONFIG[cat].color, items: grouped.get(cat)! })),
            ];

            return sectionOrder.map(({ key, label, color, items }) => {

                return (
                  <div key={key}>
                    {/* Section header */}
                    <div className="flex items-center gap-2 mb-2.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <h3 className="text-sm font-black text-foreground">{label}</h3>
                      <span className="text-[11px] text-muted-foreground font-medium">{items.length}</span>
                    </div>

                    {/* Horizontal carousel */}
                    <div
                      className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide"
                      style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}
                    >
                      {items.slice(0, 15).map((item, idx) => {
                        const rawSourceImg = sanitizeImageUrl((item.sourceImageUrl?.startsWith('https://') || item.sourceImageUrl?.startsWith('http://')) ? item.sourceImageUrl : null);
                        const safeSourceImg = rawSourceImg && !isBlockedImageDomain(rawSourceImg) ? rawSourceImg : null;
                        const platformLogo = detectPlatformLogo(item.sourceUrl, item.sourceImageUrl);
                        const bgImg = safeSourceImg || item.artistImageUrl || platformLogo;
                        const isMyArtist = watchedSet.has(item.wikiEntryId);
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
                              "flex-none snap-start rounded-2xl border overflow-hidden flex flex-col text-left transition-all active:scale-[0.97]",
                              "w-[200px] md:w-[240px]",
                              isSelected
                                ? "border-primary/50 ring-2 ring-primary/20 bg-card"
                                : "border-border/30 bg-card/60 hover:bg-card/90 hover:border-border/50"
                            )}
                          >
                            {/* Image area */}
                            <div className="relative w-full aspect-[4/3] bg-muted/30 overflow-hidden">
                              {bgImg ? (
                                <img
                                  src={bgImg}
                                  alt={getLocalizedKeyword(item, language)}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <div
                                  className="w-full h-full flex items-center justify-center font-black text-white/20"
                                  style={{ backgroundColor: config?.tileColor || "hsl(var(--muted))", fontSize: "40px" }}
                                >
                                  {getLocalizedArtistName(item, language).charAt(0)}
                                </div>
                              )}
                              {/* Rank badge */}
                              {idx < 3 && (
                                <span className="absolute top-2 left-2 w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm text-white text-[10px] font-black flex items-center justify-center">
                                  {idx + 1}
                                </span>
                              )}
                              {isMyArtist && (
                                <Star className="absolute top-2 right-2 w-3.5 h-3.5 text-amber-400 fill-amber-400 drop-shadow-md" />
                              )}
                              <span className="absolute bottom-1.5 left-2 flex items-center gap-0.5 text-[9px] text-white/90 bg-black/40 backdrop-blur-sm rounded-full px-1.5 py-0.5">
                                <Clock className="w-2.5 h-2.5" />
                                {formatAge(item.detectedAt)}
                              </span>
                            </div>

                            {/* Text area */}
                            <div className="p-3 flex flex-col gap-1.5 flex-1">
                              <span className="text-[11px] font-medium text-muted-foreground truncate">
                                {getLocalizedArtistName(item, language)}
                              </span>
                              <h4 className="text-sm font-black text-foreground line-clamp-2 leading-snug">
                                {getLocalizedKeyword(item, language)}
                              </h4>
                              <div className="flex items-center gap-2 mt-auto">
                                {item.influenceIndex > 0 && (
                                  <span className="flex items-center gap-0.5 text-[11px] font-bold text-primary">
                                    <TrendingUp className="w-3 h-3" />
                                    +{item.influenceIndex.toFixed(0)}%
                                  </span>
                                )}
                                {sortMode === "volume" && delta != null && delta !== 0 && (
                                  <span className={cn(
                                    "text-[11px] font-bold",
                                    delta > 0 ? "text-emerald-500" : "text-red-400"
                                  )}>
                                    {delta > 0 ? "+" : ""}{delta.toLocaleString()}
                                  </span>
                                )}
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
