import { useState, useMemo, useCallback, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Youtube, Twitter, Music, MessageCircle, TrendingUp, ExternalLink, Disc3 } from "lucide-react";
import BoxParticles from "@/components/v3/BoxParticles";

// ── Types ──
type EnergyCategory = "all" | "youtube" | "buzz" | "album" | "music";

interface TreemapItem {
  id: string; slug: string; title: string; imageUrl: string | null;
  energyScore: number; energyChange24h: number; totalScore: number;
  youtubeScore: number; buzzScore: number; twitterScore: number;
  albumSalesScore: number; musicScore: number;
  youtubeChange24h: number; buzzChange24h: number; albumChange24h: number; musicChange24h: number;
  sparkline: number[]; trendLabel: TrendLabel;
  ema7d: number | null; ema30d: number | null;
  metadata?: any;
  youtubeChannelId?: string | null;
  latestYoutubeVideoId?: string | null;
  latestYoutubeVideoTitle?: string | null;
}

type TrendLabel = "🔥 SURGE" | "↑ Rising" | "→ Stable" | "↘ Cooling" | "↓ Falling";

function getTrendLabel(change: number, sparkline: number[]): TrendLabel {
  const len = sparkline.length;
  if (len >= 4) {
    const recentHalf = sparkline.slice(Math.floor(len / 2));
    const firstHalf = sparkline.slice(0, Math.floor(len / 2));
    const recentAvg = recentHalf.reduce((a, b) => a + b, 0) / recentHalf.length;
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const acceleration = firstAvg > 0 ? ((recentAvg - firstAvg) / firstAvg) * 100 : 0;
    if (change >= 30 || acceleration >= 40) return "🔥 SURGE";
  }
  if (change >= 10) return "↑ Rising";
  if (change > -5) return "→ Stable";
  if (change > -15) return "↘ Cooling";
  return "↓ Falling";
}

function getTileColor(change: number): string {
  if (change >= 30) return "hsla(0, 85%, 50%, 0.9)";
  if (change >= 15) return "hsla(5, 75%, 45%, 0.8)";
  if (change >= 5) return "hsla(10, 60%, 40%, 0.7)";
  if (change > -5) return "hsla(160, 50%, 40%, 0.75)";
  if (change > -15) return "hsla(220, 55%, 35%, 0.7)";
  return "hsla(230, 60%, 28%, 0.8)";
}

function isSurging(change: number): boolean {
  return change >= 25;
}

// ── Category helpers ──
function getCategoryScore(item: TreemapItem, category: EnergyCategory): number {
  switch (category) {
    case "youtube": return item.youtubeScore;
    case "buzz": return item.buzzScore;
    case "album": return item.albumSalesScore;
    case "music": return item.musicScore;
    default: return item.energyScore;
  }
}

function getCategoryChange(item: TreemapItem, category: EnergyCategory): number {
  switch (category) {
    case "youtube": return item.youtubeChange24h;
    case "buzz": return item.buzzChange24h;
    case "album": return item.albumChange24h;
    case "music": return item.musicChange24h;
    default: return item.energyChange24h;
  }
}

const CATEGORY_CONFIG: Record<EnergyCategory, { label: string; icon: React.ReactNode; color: string }> = {
  all: { label: "전체", icon: <TrendingUp className="w-3 h-3" />, color: "hsl(var(--primary))" },
  youtube: { label: "YouTube", icon: <Youtube className="w-3 h-3" />, color: "hsl(0, 70%, 50%)" },
  buzz: { label: "Buzz", icon: <MessageCircle className="w-3 h-3" />, color: "hsl(280, 60%, 55%)" },
  album: { label: "Album", icon: <Disc3 className="w-3 h-3" />, color: "hsl(35, 80%, 50%)" },
  music: { label: "Music", icon: <Music className="w-3 h-3" />, color: "hsl(145, 60%, 45%)" },
};

// ── Sparkline ──
function MiniSparkline({ data, width, height, color = "rgba(255,255,255,0.5)", ema7d, ema30d }: { data: number[]; width: number; height: number; color?: string; ema7d?: number | null; ema30d?: number | null }) {
  if (data.length < 2) return null;
  const min = Math.min(...data, ema7d ?? Infinity, ema30d ?? Infinity); const max = Math.max(...data, ema7d ?? -Infinity, ema30d ?? -Infinity); const range = max - min || 1; const padding = 2;
  const points = data.map((v, i) => { const x = (i / (data.length - 1)) * width; const y = height - padding - ((v - min) / range) * (height - padding * 2); return `${x},${y}`; }).join(" ");
  const areaPoints = `0,${height} ${points} ${width},${height}`;
  const emaY = (val: number) => height - padding - ((val - min) / range) * (height - padding * 2);
  return (
    <svg width={width} height={height} className="absolute bottom-0 left-0 opacity-50 pointer-events-none">
      <defs><linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.3" /><stop offset="100%" stopColor={color} stopOpacity="0.05" /></linearGradient></defs>
      <polygon points={areaPoints} fill="url(#sparkFill)" /><polyline points={points} fill="none" stroke={color} strokeWidth="1.5" />
      {ema7d != null && <line x1={0} y1={emaY(ema7d)} x2={width} y2={emaY(ema7d)} stroke="hsl(0, 80%, 65%)" strokeWidth="1" strokeDasharray="3,2" opacity="0.8" />}
      {ema30d != null && <line x1={0} y1={emaY(ema30d)} x2={width} y2={emaY(ema30d)} stroke="hsl(210, 80%, 65%)" strokeWidth="1" strokeDasharray="5,3" opacity="0.7" />}
    </svg>
  );
}

// ── Squarify layout ──
interface Rect { x: number; y: number; w: number; h: number; item: TreemapItem; }

function squarify(items: TreemapItem[], x: number, y: number, w: number, h: number, category: EnergyCategory): Rect[] {
  if (items.length === 0) return [];
  if (items.length === 1) return [{ x, y, w, h, item: items[0] }];
  const tileSize = (i: TreemapItem, idx: number) => {
    const score = getCategoryScore(i, category);
    const base = Math.log1p(Math.max(score, 1));
    if (idx === 0) return base * 2.2;
    if (idx === 1) return base * 1.7;
    if (idx === 2) return base * 1.4;
    return base;
  };
  const totalValue = items.reduce((s, i, idx) => s + tileSize(i, idx), 0);
  const totalArea = w * h;
  const areas = items.map((i, idx) => (tileSize(i, idx) / totalValue) * totalArea);
  const rects: Rect[] = [];
  let cx = x, cy = y, cw = w, ch = h, idx = 0;
  while (idx < items.length) {
    const isHorizontal = cw >= ch; const side = isHorizontal ? ch : cw;
    const row: number[] = [idx]; let rowArea = areas[idx];
    let bestWorst = worstAspect(row.map(i => areas[i]), rowArea, side);
    for (let j = idx + 1; j < items.length; j++) {
      const testRow = [...row, j]; const testArea = rowArea + areas[j];
      const testWorst = worstAspect(testRow.map(i => areas[i]), testArea, side);
      if (testWorst <= bestWorst) { row.push(j); rowArea = testArea; bestWorst = testWorst; } else break;
    }
    const rowLength = rowArea / side;
    let rx = cx, ry = cy;
    for (const ri of row) {
      const itemArea = areas[ri]; const itemLength = itemArea / rowLength;
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

// ── Channel Bar ──
function ChannelBar({ icon, label, value, total, color, href }: { icon: React.ReactNode; label: string; value: number; total: number; color: string; href?: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  const content = (
    <div className={cn("space-y-1.5 p-2.5 rounded-xl border border-border bg-muted/40 transition-all", href && "hover:border-primary/40 hover:bg-muted/70 cursor-pointer active:scale-[0.98]")}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-semibold text-foreground">{icon} {label}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-foreground">{Math.round(value)} <span className="text-muted-foreground">({pct.toFixed(0)}%)</span></span>
          {href && <ExternalLink className="w-3 h-3 text-muted-foreground" />}
        </div>
      </div>
      <div className="h-3 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
  if (href) return <a href={href} target="_blank" rel="noopener noreferrer">{content}</a>;
  return content;
}

// ── Inspector Panel ──
function InspectorPanel({ item, onClose }: { item: TreemapItem; onClose: () => void }) {
  const navigate = useNavigate();
  const total = (item.youtubeScore || 0) + (item.buzzScore || 0) + (item.twitterScore || 0) + (item.albumSalesScore || 0) + (item.musicScore || 0);
  const surging = isSurging(item.energyChange24h);

  const encodedName = encodeURIComponent(item.title);
  const musicCharts = item.metadata?.music_charts;
  const latestSong = musicCharts?.spotify?.top_songs?.[0]?.title || musicCharts?.melon?.top_songs?.[0]?.title;
  const musicSearchQuery = latestSong ? encodeURIComponent(`${item.title} ${latestSong}`) : encodedName;

  const channels = [
    { icon: <Youtube className="w-3.5 h-3.5" />, label: item.latestYoutubeVideoTitle ? `YouTube · ${item.latestYoutubeVideoTitle}` : "YouTube", value: item.youtubeScore, color: "hsl(0, 70%, 50%)", change: item.youtubeChange24h, href: item.latestYoutubeVideoId ? `https://www.youtube.com/watch?v=${item.latestYoutubeVideoId}` : item.youtubeChannelId ? `https://www.youtube.com/channel/${item.youtubeChannelId}/videos` : `https://www.youtube.com/results?search_query=${encodedName}` },
    { icon: <MessageCircle className="w-3.5 h-3.5" />, label: "Buzz", value: item.buzzScore, color: "hsl(280, 60%, 55%)", change: item.buzzChange24h, href: `https://x.com/search?q=${encodedName}&src=typed_query` },
    { icon: <Disc3 className="w-3.5 h-3.5" />, label: "Album Sales", value: item.albumSalesScore, color: "hsl(35, 80%, 50%)", change: item.albumChange24h },
    { icon: <Music className="w-3.5 h-3.5" />, label: latestSong ? `Music · ${latestSong}` : "Music", value: item.musicScore, color: "hsl(145, 60%, 45%)", change: item.musicChange24h, href: `https://open.spotify.com/search/${musicSearchQuery}` },
  ].filter(c => c.value > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-12 pb-20 overflow-y-auto animate-fade-in" onClick={onClose}>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
      <div className={cn(
        "relative z-10 w-full max-w-sm rounded-2xl border overflow-hidden shadow-2xl my-auto",
        surging ? "border-destructive/50 bg-card" : "border-border bg-card"
      )} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border min-w-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {surging && <span className="text-lg animate-fire-burn shrink-0">🔥</span>}
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold truncate">
                {surging ? "Energy Surging" : "Fan Energy Inspector"}
              </p>
              <p className="text-sm font-black text-foreground truncate">{item.title}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none p-1 shrink-0 ml-2">×</button>
        </div>

        <div className="p-4 space-y-5 overflow-hidden">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-muted/50 border border-border p-3 text-center overflow-hidden">
              <p className="text-[10px] text-muted-foreground mb-1">FES</p>
              <p className="text-xl font-black text-foreground truncate">{Math.round(item.energyScore)}</p>
            </div>
            <div className="rounded-xl bg-muted/50 border border-border p-3 text-center overflow-hidden">
              <p className="text-[10px] text-muted-foreground mb-1">24h Δ</p>
              <p className={cn("text-lg font-black truncate",
                item.energyChange24h >= 15 ? "text-destructive" : item.energyChange24h >= 0 ? "text-green-500" : "text-blue-400"
              )}>
                {item.energyChange24h > 0 ? "+" : ""}{item.energyChange24h.toFixed(1)}%
              </p>
            </div>
          </div>

          {/* Per-category changes */}
          {channels.length > 0 && (
            <div className="space-y-3 rounded-xl bg-muted/30 border border-border p-4 my-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" /> Category Changes (24h)
              </p>
              <div className="space-y-2">
                {channels.map(ch => (
                  <div key={ch.label}>
                    <ChannelBar icon={ch.icon} label={ch.label} value={ch.value} total={total} color={ch.color} href={ch.href} />
                    <div className="flex justify-end mt-0.5 mr-1">
                      <span className={cn("text-[10px] font-bold",
                        ch.change > 0 ? "text-green-500" : ch.change < 0 ? "text-red-400" : "text-muted-foreground"
                      )}>
                        {ch.change > 0 ? "+" : ""}{ch.change.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {item.sparkline.length >= 2 && (
            <div className="rounded-xl bg-muted/30 border border-border p-3">
              <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider font-semibold">Score Momentum</p>
              <div className="flex items-center gap-3 mb-1">
                <span className="flex items-center gap-1 text-[9px]"><span className="inline-block w-4 h-0 border-t border-dashed" style={{ borderColor: "hsl(0, 80%, 65%)" }} /> <span className="text-muted-foreground">7d EMA</span></span>
                <span className="flex items-center gap-1 text-[9px]"><span className="inline-block w-4 h-0 border-t-2 border-dashed" style={{ borderColor: "hsl(210, 80%, 65%)" }} /> <span className="text-muted-foreground">30d EMA</span></span>
              </div>
              <div className="relative h-16 overflow-hidden">
                <MiniSparkline data={item.sparkline} width={280} height={64}
                  color={item.energyChange24h >= 15 ? "hsl(0, 80%, 60%)" : item.energyChange24h >= 0 ? "hsl(145, 65%, 50%)" : "hsl(220, 70%, 60%)"}
                  ema7d={item.ema7d} ema30d={item.ema30d} />
              </div>
            </div>
          )}

          <button onClick={() => navigate(`/artist/${item.slug}`)}
            className="w-full flex items-center justify-center gap-2 text-xs font-bold text-primary-foreground bg-primary hover:bg-primary/90 py-2.5 rounded-full transition-colors">
            <ExternalLink className="w-3.5 h-3.5" /> View Full Profile
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Treemap Component ──
const V3Treemap = () => {
  const [selectedItem, setSelectedItem] = useState<TreemapItem | null>(null);
  const [category, setCategory] = useState<EnergyCategory>("all");
  const isMobile = useIsMobile();
  const displayCount = isMobile ? 15 : 16;

  const { data: items, isLoading } = useQuery({
    queryKey: ["v3-treemap-data-v2", displayCount],
    queryFn: async () => {
      const { data, error } = await supabase.from("v3_scores_v2" as any)
        .select(`wiki_entry_id, total_score, energy_score, energy_change_24h,
          youtube_score, buzz_score, album_sales_score, music_score,
          youtube_change_24h, buzz_change_24h, album_change_24h, music_change_24h,
          scored_at,
          wiki_entries:wiki_entry_id (id, title, slug, image_url, metadata)`)
        .order("total_score", { ascending: false })
        .limit(60);
      if (error) throw error;
      if (!data?.length) return [];
      const typedData = data as any[];
      const latestMap = new Map<string, any>();
      for (const s of typedData) {
        if (!latestMap.has(s.wiki_entry_id)) latestMap.set(s.wiki_entry_id, s);
      }

      const allCandidates = Array.from(latestMap.values())
        .filter((s) => (s.wiki_entries as any)?.slug);
      
      const sortedByChange = [...allCandidates].sort(
        (a, b) => (b.energy_change_24h || 0) - (a.energy_change_24h || 0)
      );
      
      const top5 = sortedByChange.slice(0, 5);
      const bottom5 = sortedByChange.slice(-5).reverse();
      const selectedIds = new Set([...top5, ...bottom5].map(s => s.wiki_entry_id));
      const middle5 = [...allCandidates]
        .filter(s => !selectedIds.has(s.wiki_entry_id))
        .sort((a, b) => Math.abs(a.energy_change_24h || 0) - Math.abs(b.energy_change_24h || 0))
        .slice(0, 5);
      
      const topItems = [...top5, ...middle5, ...bottom5];
      const topIds = topItems.map((s) => s.wiki_entry_id);

      const [{ data: snapshots }, { data: baselines }, { data: tierData }] = await Promise.all([
        supabase.from("v3_energy_snapshots_v2" as any)
          .select("wiki_entry_id, energy_score, snapshot_at")
          .in("wiki_entry_id", topIds)
          .order("snapshot_at", { ascending: true })
          .limit(500),
        supabase.from("v3_energy_baselines_v2" as any)
          .select("wiki_entry_id, avg_energy_7d, avg_energy_30d")
          .in("wiki_entry_id", topIds),
        supabase.from("v3_artist_tiers" as any)
          .select("wiki_entry_id, youtube_channel_id, latest_youtube_video_id, latest_youtube_video_title")
          .in("wiki_entry_id", topIds)
          .not("youtube_channel_id", "is", null),
      ]);

      const sparklineMap = new Map<string, number[]>();
      for (const snap of (snapshots || []) as any[]) {
        if (!sparklineMap.has(snap.wiki_entry_id)) sparklineMap.set(snap.wiki_entry_id, []);
        sparklineMap.get(snap.wiki_entry_id)!.push(Number(snap.energy_score) || 0);
      }

      const baselineMap = new Map<string, { ema7d: number | null; ema30d: number | null }>();
      for (const b of (baselines || []) as any[]) {
        baselineMap.set(b.wiki_entry_id, { ema7d: b.avg_energy_7d, ema30d: b.avg_energy_30d });
      }

      const ytChannelMap = new Map<string, { channelId: string; videoId?: string; videoTitle?: string }>();
      for (const t of (tierData || []) as any[]) {
        if (t.youtube_channel_id) ytChannelMap.set(t.wiki_entry_id, {
          channelId: t.youtube_channel_id,
          videoId: t.latest_youtube_video_id || undefined,
          videoTitle: t.latest_youtube_video_title || undefined,
        });
      }

      return topItems.map((s) => {
        const entry = s.wiki_entries as any;
        const sparkline = sparklineMap.get(s.wiki_entry_id) || [];
        const change = s.energy_change_24h || 0;
        const bl = baselineMap.get(s.wiki_entry_id);
        return {
          id: s.wiki_entry_id, slug: entry?.slug || "", title: entry?.title || "Unknown",
          imageUrl: entry?.image_url || (entry?.metadata as any)?.profile_image || null,
          energyScore: s.energy_score || 0, energyChange24h: change, totalScore: s.total_score || 0,
          youtubeScore: s.youtube_score || 0, buzzScore: s.buzz_score || 0, twitterScore: 0,
          albumSalesScore: s.album_sales_score || 0, musicScore: s.music_score || 0,
          youtubeChange24h: s.youtube_change_24h || 0,
          buzzChange24h: s.buzz_change_24h || 0,
          albumChange24h: s.album_change_24h || 0,
          musicChange24h: s.music_change_24h || 0,
          sparkline, trendLabel: getTrendLabel(change, sparkline),
          ema7d: bl?.ema7d ?? null, ema30d: bl?.ema30d ?? null,
          metadata: entry?.metadata || null,
          youtubeChannelId: ytChannelMap.get(s.wiki_entry_id)?.channelId || null,
          latestYoutubeVideoId: ytChannelMap.get(s.wiki_entry_id)?.videoId || null,
          latestYoutubeVideoTitle: ytChannelMap.get(s.wiki_entry_id)?.videoTitle || null,
        };
      });
    },
    staleTime: 30_000,
  });

  // Sort and layout by selected category
  const sortedItems = useMemo(() => {
    if (!items?.length) return [];
    return [...items].sort((a, b) => getCategoryChange(b, category) - getCategoryChange(a, category));
  }, [items, category]);

  const containerWidth = isMobile ? 360 : 420;
  const containerHeight = isMobile ? 620 : 520;
  const rects = useMemo(() => {
    if (!sortedItems.length) return [];
    return squarify(sortedItems, 0, 0, containerWidth, containerHeight, category);
  }, [sortedItems, containerWidth, containerHeight, category]);

  const handleTileClick = useCallback((item: TreemapItem) => {
    setSelectedItem(prev => prev?.id === item.id ? null : item);
  }, []);

  const topChangeId = useMemo(() => {
    if (!sortedItems.length) return null;
    return sortedItems[0]?.id || null;
  }, [sortedItems]);

  if (isLoading) return (
    <div className="px-4 pb-4">
      <div className="pt-4 pb-3">
        <Skeleton className="h-7 w-40 mb-1" />
        <Skeleton className="h-4 w-64 ml-7" />
      </div>
      <div className="flex items-center justify-center gap-4 mb-3">
        {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-7 w-14 rounded-full" />)}
      </div>
      <div className="relative w-full rounded-2xl overflow-hidden border border-border" style={{ aspectRatio: `${containerWidth} / ${containerHeight}` }}>
        <div className="absolute inset-0 grid grid-cols-3 grid-rows-4 gap-[2px] p-[2px]">
          {[...Array(10)].map((_, i) => (
            <Skeleton key={i} className={cn("rounded-lg", i === 0 && "col-span-2 row-span-2", i === 1 && "row-span-2")} />
          ))}
        </div>
      </div>
    </div>
  );

  if (!items?.length) return <div className="px-4 py-16 text-center"><p className="text-sm text-muted-foreground">No energy data available yet.</p></div>;

  const maxAbsChange = Math.max(...sortedItems.map(i => Math.abs(getCategoryChange(i, category))), 1);

  return (
    <div className="px-4 pb-4">
      {/* Header */}
      <div className="pt-4 pb-3">
        <h2 className="text-xl font-black text-muted-foreground">⚡ Energy Map</h2>
        <p className="text-xs text-muted-foreground mt-0.5 pl-7">
          카테고리별 24h 변동률 · Top {displayCount} · Tap to inspect
        </p>
      </div>

      {/* Category Filter Chips */}
      <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1 scrollbar-hide">
        {(Object.keys(CATEGORY_CONFIG) as EnergyCategory[]).map((cat) => {
          const config = CATEGORY_CONFIG[cat];
          const isActive = category === cat;
          return (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all border",
                isActive
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground"
              )}
            >
              {config.icon}
              {config.label}
            </button>
          );
        })}
      </div>


      {/* Inspector */}
      {selectedItem && <InspectorPanel item={selectedItem} onClose={() => setSelectedItem(null)} />}

      {/* Treemap */}
      <div className="relative w-full rounded-2xl overflow-hidden border border-border" style={{ aspectRatio: `${containerWidth} / ${containerHeight}` }}>
        <div className="absolute inset-0">
          {rects.map((rect) => {
            const left = (rect.x / containerWidth) * 100; const top = (rect.y / containerHeight) * 100;
            const width = (rect.w / containerWidth) * 100; const height = (rect.h / containerHeight) * 100;
            const isLarge = width > 18 && height > 15; const isMedium = width > 10 && height > 8;
            const isSelected = selectedItem?.id === rect.item.id;
            const catChange = getCategoryChange(rect.item, category);
            const catScore = getCategoryScore(rect.item, category);
            const surging = isSurging(catChange);

            return (
              <button key={rect.item.id} onClick={() => handleTileClick(rect.item)}
                className={cn(
                  "absolute border transition-all duration-200 flex flex-col items-center justify-center p-1.5 overflow-hidden",
                  rect.item.id === topChangeId ? "z-10 shadow-[inset_0_0_24px_8px_hsla(25,100%,55%,0.6),0_0_16px_4px_hsla(11,100%,46%,0.4)] border-2 border-orange-400/60" : "",
                  isSelected ? "border-primary ring-2 ring-primary/40 z-20 brightness-110" : "border-background/20 hover:brightness-125 hover:z-10"
                )}
                style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%`, background: getTileColor(catChange) }}>

                {isMedium && (() => {
                  const isTop1 = rect.item.id === topChangeId;
                  const absChange = Math.abs(catChange);
                  return (
                    <BoxParticles
                      count={isTop1 ? 80 : Math.max(5, Math.round((absChange / maxAbsChange) * 40))}
                      speed={isTop1 ? 0.7 : Math.max(0.1, Math.min(1, absChange / maxAbsChange))}
                      density={isTop1 ? 1.0 : 0.5}
                      color={isTop1 ? "hsl(35, 100%, 70%)" : "hsl(0, 0%, 100%)"}
                    />
                  );
                })()}

                {rect.item.sparkline.length >= 2 && isMedium && (
                  <MiniSparkline data={rect.item.sparkline} width={Math.round(rect.w)} height={Math.round(rect.h)}
                    color={catChange >= 0 ? "rgba(255,255,255,0.45)" : "rgba(150,180,255,0.45)"}
                    ema7d={rect.item.ema7d} ema30d={rect.item.ema30d} />
                )}

                {/* Category change badge */}
                {isMedium && catChange !== 0 && (
                  <span className={cn(
                    "absolute top-1 right-1 z-20 text-[8px] md:text-[10px] font-bold drop-shadow-md",
                    catChange >= 15 ? "text-white" : catChange > 0 ? "text-green-200" : "text-blue-200"
                  )}>
                    {catChange > 0 ? "▲" : "▼"}{Math.abs(catChange).toFixed(1)}%
                  </span>
                )}

                {isLarge ? (
                  <div className="relative z-10 flex flex-col items-center gap-0.5">
                    <span className="text-xs md:text-base font-black text-white truncate max-w-full leading-tight drop-shadow-lg">{rect.item.title}</span>
                    <span className="text-base md:text-xl font-black text-white/95 drop-shadow-lg">{Math.round(catScore)}</span>
                    <span className={cn("text-[9px] md:text-xs font-bold px-2 md:px-3 py-0.5 md:py-1 rounded-full backdrop-blur-sm",
                      surging ? "bg-white/20 text-white" : "bg-black/30 text-white/80"
                    )}>
                      {surging ? "🔥 " : ""}{catChange > 0 ? "+" : ""}{catChange.toFixed(1)}%
                    </span>
                  </div>
                ) : isMedium ? (
                  <div className="relative z-10 flex flex-col items-center">
                    <span className="text-[10px] font-bold text-white truncate max-w-full leading-tight drop-shadow-md">{rect.item.title}</span>
                    <span className="text-[11px] font-black text-white/90 drop-shadow-md">{Math.round(catScore)}</span>
                  </div>
                ) : (
                  <div className="relative z-10 flex flex-col items-center overflow-hidden w-full">
                    <span className="text-[7px] font-bold text-white/80 truncate max-w-full leading-tight drop-shadow-md">{rect.item.title}</span>
                    <span className="text-[8px] font-black text-white/70 drop-shadow-md">{Math.round(catScore)}</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default V3Treemap;
