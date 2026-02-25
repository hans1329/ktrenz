import { useState, useMemo, useCallback, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Youtube, Twitter, Music, MessageCircle, TrendingUp, ExternalLink } from "lucide-react";
import BoxParticles from "@/components/v3/BoxParticles";

// ── Types ──
interface TreemapItem {
  id: string; slug: string; title: string; imageUrl: string | null;
  energyScore: number; energyChange24h: number; totalScore: number;
  youtubeScore: number; buzzScore: number; twitterScore: number;
  albumSalesScore: number; musicScore: number;
  sparkline: number[]; trendLabel: TrendLabel;
  ema7d: number | null; ema30d: number | null;
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

// Color: RED=rising, GREEN=stable, BLUE=falling
function getTileColor(change: number): string {
  if (change >= 30) return "hsla(0, 85%, 50%, 0.9)";     // HOT RED
  if (change >= 15) return "hsla(5, 75%, 45%, 0.8)";      // RED
  if (change >= 5) return "hsla(10, 60%, 40%, 0.7)";      // WARM RED
  if (change > -5) return "hsla(160, 50%, 40%, 0.75)";     // Mint stable
  if (change > -15) return "hsla(220, 55%, 35%, 0.7)";    // BLUE cooling
  return "hsla(230, 60%, 28%, 0.8)";                       // DEEP BLUE falling
}

function isSurging(change: number): boolean {
  return change >= 25;
}

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

function squarify(items: TreemapItem[], x: number, y: number, w: number, h: number): Rect[] {
  if (items.length === 0) return [];
  if (items.length === 1) return [{ x, y, w, h, item: items[0] }];
  // 타일 크기: 에너지 점수(share) 비례
  const tileSize = (i: TreemapItem) => Math.max(i.energyScore, 1);
  const totalValue = items.reduce((s, i) => s + tileSize(i), 0);
  const totalArea = w * h;
  const areas = items.map(i => (tileSize(i) / totalValue) * totalArea);
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
function ChannelBar({ icon, label, value, total, color }: { icon: React.ReactNode; label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-semibold text-foreground">{icon} {label}</span>
        <span className="text-xs font-bold text-foreground">{Math.round(value)} <span className="text-muted-foreground">({pct.toFixed(0)}%)</span></span>
      </div>
      <div className="h-3 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

// ── Inspector Panel (enhanced) ──
function InspectorPanel({ item, onClose }: { item: TreemapItem; onClose: () => void }) {
  const navigate = useNavigate();
  const total = (item.youtubeScore || 0) + (item.buzzScore || 0) + (item.twitterScore || 0) + (item.albumSalesScore || 0) + (item.musicScore || 0);
  const surging = isSurging(item.energyChange24h);

  const channels = [
    { icon: <Youtube className="w-3.5 h-3.5" />, label: "YouTube", value: item.youtubeScore, color: "hsl(0, 70%, 50%)" },
    { icon: <MessageCircle className="w-3.5 h-3.5" />, label: "Buzz", value: item.buzzScore, color: "hsl(280, 60%, 55%)" },
    { icon: <Twitter className="w-3.5 h-3.5" />, label: "X", value: item.twitterScore, color: "hsl(203, 89%, 53%)" },
    { icon: <Music className="w-3.5 h-3.5" />, label: "Album Sales", value: item.albumSalesScore, color: "hsl(35, 80%, 50%)" },
    { icon: <Music className="w-3.5 h-3.5" />, label: "Music", value: item.musicScore, color: "hsl(145, 60%, 45%)" },
  ].filter(c => c.value > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-12 pb-20 overflow-y-auto animate-fade-in" onClick={onClose}>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
      <div className={cn(
        "relative z-10 w-full max-w-sm rounded-2xl border overflow-hidden shadow-2xl my-auto",
        surging ? "border-destructive/50 animate-neon-surge bg-card" : "border-border bg-card"
      )} onClick={e => e.stopPropagation()}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          {surging && <span className="text-lg animate-fire-burn">🔥</span>}
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
              {surging ? "Energy Surging" : "Fan Energy Inspector"}
            </p>
            <p className="text-sm font-black text-foreground">{item.title}</p>
          </div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none p-1">×</button>
      </div>

      <div className="p-4 space-y-5">
        {/* Energy Stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-muted/50 border border-border p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-1">FES</p>
            <p className="text-xl font-black text-foreground">{Math.round(item.energyScore)}</p>
          </div>
          <div className="rounded-xl bg-muted/50 border border-border p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-1">24h Δ</p>
            <p className={cn("text-xl font-black",
              item.energyChange24h >= 15 ? "text-destructive" : item.energyChange24h >= 0 ? "text-green-500" : "text-blue-400"
            )}>
              {item.energyChange24h > 0 ? "+" : ""}{item.energyChange24h.toFixed(1)}%
            </p>
          </div>
          <div className="rounded-xl bg-muted/50 border border-border p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-1">Trend</p>
            <p className="text-sm font-black text-foreground">{item.trendLabel}</p>
          </div>
        </div>

        {/* Channel Energy Distribution */}
        {channels.length > 0 && (
          <div className="space-y-3 rounded-xl bg-muted/30 border border-border p-4 my-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" /> Energy Heat Channels
            </p>
            <div className="space-y-3.5">
              {channels.map(ch => (
                <ChannelBar key={ch.label} icon={ch.icon} label={ch.label} value={ch.value} total={total} color={ch.color} />
              ))}
            </div>
          </div>
        )}

        {/* Sparkline */}
        {item.sparkline.length >= 2 && (
          <div className="rounded-xl bg-muted/30 border border-border p-3">
            <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider font-semibold">Score Momentum</p>
            <div className="flex items-center gap-3 mb-1">
              <span className="flex items-center gap-1 text-[9px]"><span className="inline-block w-4 h-0 border-t border-dashed" style={{ borderColor: "hsl(0, 80%, 65%)" }} /> <span className="text-muted-foreground">7d EMA</span></span>
              <span className="flex items-center gap-1 text-[9px]"><span className="inline-block w-4 h-0 border-t-2 border-dashed" style={{ borderColor: "hsl(210, 80%, 65%)" }} /> <span className="text-muted-foreground">30d EMA</span></span>
            </div>
            <div className="relative h-16">
              <MiniSparkline data={item.sparkline} width={320} height={64}
                color={item.energyChange24h >= 15 ? "hsl(0, 80%, 60%)" : item.energyChange24h >= 0 ? "hsl(145, 65%, 50%)" : "hsl(220, 70%, 60%)"}
                ema7d={item.ema7d} ema30d={item.ema30d} />
            </div>
          </div>
        )}

        {/* CTA */}
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
  const isMobile = useIsMobile();
  const displayCount = isMobile ? 15 : 16;

  const { data: items, isLoading } = useQuery({
    queryKey: ["v3-treemap-data-v2", displayCount],
    queryFn: async () => {
      const { data, error } = await supabase.from("v3_scores_v2" as any)
        .select(`wiki_entry_id, total_score, energy_score, energy_change_24h, youtube_score, buzz_score, album_sales_score, music_score, scored_at,
          wiki_entries:wiki_entry_id (id, title, slug, image_url, metadata)`)
        .order("total_score", { ascending: false })
        .limit(30);
      if (error) throw error;
      if (!data?.length) return [];
      const typedData = data as any[];
      // Deduplicate: keep latest per artist
      const latestMap = new Map<string, any>();
      for (const s of typedData) {
        if (!latestMap.has(s.wiki_entry_id)) latestMap.set(s.wiki_entry_id, s);
      }

      // 인기도(total_score) 상위 N개 선정
      const topItems = Array.from(latestMap.values())
        .filter((s) => (s.wiki_entries as any)?.slug)
        .sort((a, b) => (b.total_score || 0) - (a.total_score || 0))
        .slice(0, displayCount);

      // Fetch sparkline and baselines for these top artists
      const topIds = topItems.map((s) => s.wiki_entry_id);
      const [{ data: snapshots }, { data: baselines }] = await Promise.all([
        supabase
          .from("v3_energy_snapshots_v2" as any)
          .select("wiki_entry_id, energy_score, snapshot_at")
          .in("wiki_entry_id", topIds)
          .order("snapshot_at", { ascending: true })
          .limit(500),
        supabase
          .from("v3_energy_baselines_v2" as any)
          .select("wiki_entry_id, avg_energy_7d, avg_energy_30d")
          .in("wiki_entry_id", topIds),
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

      return topItems.map((s) => {
        const entry = s.wiki_entries as any;
        const sparkline = sparklineMap.get(s.wiki_entry_id) || [];
        const change = s.energy_change_24h || 0;
        const bl = baselineMap.get(s.wiki_entry_id);
        return {
          id: s.wiki_entry_id, slug: entry?.slug || "", title: entry?.title || "Unknown",
          imageUrl: entry?.image_url || (entry?.metadata as any)?.profile_image || null,
          energyScore: s.energy_score || 0, energyChange24h: change, totalScore: s.total_score || 0,
          youtubeScore: s.youtube_score || 0,
          buzzScore: s.buzz_score || 0, twitterScore: 0,
          albumSalesScore: s.album_sales_score || 0, musicScore: s.music_score || 0,
          sparkline, trendLabel: getTrendLabel(change, sparkline),
          ema7d: bl?.ema7d ?? null, ema30d: bl?.ema30d ?? null,
        };
      });
    },
    staleTime: 30_000,
  });

  // 에너지 점수(share) 내림차순 정렬 후 squarify
  const sortedItems = useMemo(() => {
    if (!items?.length) return [];
    return [...items].sort((a, b) => b.energyScore - a.energyScore);
  }, [items]);
  const containerWidth = isMobile ? 360 : 420;
  const containerHeight = isMobile ? 620 : 520;
  const rects = useMemo(() => { if (!sortedItems.length) return []; return squarify(sortedItems, 0, 0, containerWidth, containerHeight); }, [sortedItems, containerWidth, containerHeight]);
  const handleTileClick = useCallback((item: TreemapItem) => { setSelectedItem(prev => prev?.id === item.id ? null : item); }, []);

  if (isLoading) return (
    <div className="px-4 pb-4">
      <div className="pt-4 pb-3">
        <Skeleton className="h-7 w-40 mb-1" />
        <Skeleton className="h-4 w-64 ml-7" />
      </div>
      <div className="flex items-center justify-center gap-4 mb-3">
        {[1,2,3,4].map(i => <Skeleton key={i} className="h-4 w-14 rounded-sm" />)}
      </div>
      <div className="relative w-full rounded-2xl overflow-hidden border border-border" style={{ aspectRatio: `${containerWidth} / ${containerHeight}` }}>
        <div className="absolute inset-0 grid grid-cols-3 grid-rows-4 gap-[2px] p-[2px]">
          {[...Array(10)].map((_, i) => (
            <Skeleton key={i} className={cn(
              "rounded-lg",
              i === 0 && "col-span-2 row-span-2",
              i === 1 && "row-span-2",
            )} />
          ))}
        </div>
      </div>
    </div>
  );
  if (!items?.length) return <div className="px-4 py-16 text-center"><p className="text-sm text-muted-foreground">No energy data available yet.</p></div>;

  const totalEnergy = items.reduce((s, i) => s + i.energyScore, 0);
  const maxEnergy = items.length > 0 ? Math.max(...items.map(i => i.energyScore)) : 1;
  const maxChange = items.length > 0 ? Math.max(...items.map(i => i.energyChange24h), 1) : 1;

  return (
    <div className="px-4 pb-4">
      {/* Header */}
      <div className="pt-4 pb-3">
        <h2 className="text-xl font-black text-muted-foreground">⚡ Energy Map</h2>
        <p className="text-xs text-muted-foreground mt-0.5 pl-7">
          지금 어디서 폭발하고 있나? · Top {displayCount} · Tap to inspect
        </p>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mb-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "hsla(0, 85%, 50%, 0.9)" }} />
          <span className="font-semibold">Rising</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "hsla(160, 50%, 40%, 0.75)" }} />
          <span className="font-semibold">Stable</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "hsla(220, 55%, 35%, 0.7)" }} />
          <span className="font-semibold">Falling</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm border border-destructive/50 animate-neon-surge" style={{ background: "hsla(0, 85%, 50%, 0.9)" }} />
          <span className="font-semibold">SURGE</span>
        </span>
      </div>

      {/* Inspector */}
      {selectedItem && <InspectorPanel item={selectedItem} onClose={() => setSelectedItem(null)} />}

      {/* Treemap */}
      <div className="relative w-full rounded-2xl overflow-hidden border border-border" style={{ aspectRatio: `${containerWidth} / ${containerHeight}` }}>
        <div className="absolute inset-0">
          {rects.map((rect) => {
            const left = (rect.x / containerWidth) * 100; const top = (rect.y / containerHeight) * 100;
            const width = (rect.w / containerWidth) * 100; const height = (rect.h / containerHeight) * 100;
            const isLarge = width > 18 && height > 15; const isMedium = width > 10 && height > 8; const isSmall = !isLarge && !isMedium;
            const isSelected = selectedItem?.id === rect.item.id;
            const surging = isSurging(rect.item.energyChange24h);
            const sharePct = totalEnergy > 0 ? (rect.item.energyScore / totalEnergy * 100) : 0;

            return (
              <button key={rect.item.id} onClick={() => handleTileClick(rect.item)}
                className={cn(
                  "absolute border transition-all duration-200 overflow-hidden flex flex-col items-center justify-center p-1.5",
                  surging && "animate-neon-surge animate-energy-ripple",
                  isSelected ? "border-primary ring-2 ring-primary/40 z-20 brightness-110" : "border-background/20 hover:brightness-125 hover:z-10"
                )}
                style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%`, background: getTileColor(rect.item.energyChange24h) }}>

                {isMedium && (
                  <BoxParticles
                    count={Math.max(3, Math.round(sharePct * 1.5))}
                    speed={Math.max(0.05, Math.min(1, rect.item.energyChange24h / maxChange))}
                    density={Math.min(1, rect.item.energyScore / maxEnergy)}
                    color="hsl(0, 0%, 100%)"
                  />
                )}

                {rect.item.sparkline.length >= 2 && isMedium && (
                  <MiniSparkline data={rect.item.sparkline} width={Math.round(rect.w)} height={Math.round(rect.h)}
                    color={rect.item.energyChange24h >= 0 ? "rgba(255,255,255,0.45)" : "rgba(150,180,255,0.45)"}
                    ema7d={rect.item.ema7d} ema30d={rect.item.ema30d} />
                )}

                {/* 24h 변동률 뱃지 - 우상단 */}
                {isMedium && rect.item.energyChange24h !== 0 && (
                  <span className={cn(
                    "absolute top-1 right-1 z-20 text-[8px] md:text-[10px] font-bold drop-shadow-md",
                    rect.item.energyChange24h >= 15 ? "text-white" :
                    rect.item.energyChange24h > 0 ? "text-green-200" :
                    "text-blue-200"
                  )}>
                    {rect.item.energyChange24h > 0 ? "▲" : "▼"}{Math.abs(rect.item.energyChange24h).toFixed(1)}%
                  </span>
                )}

                {isLarge ? (
                  <div className="relative z-10 flex flex-col items-center gap-0.5">
                    <span className="text-xs md:text-base font-black text-white truncate max-w-full leading-tight drop-shadow-lg">{rect.item.title}</span>
                    <span className="text-base md:text-xl font-black text-white/95 drop-shadow-lg">{Math.round(rect.item.energyScore)}</span>
                    <span className={cn("text-[9px] md:text-xs font-bold px-2 md:px-3 py-0.5 md:py-1 rounded-full backdrop-blur-sm",
                      surging ? "bg-white/20 text-white" : "bg-black/30 text-white/80"
                    )}>
                      {surging ? "🔥" : ""} {sharePct.toFixed(1)}% share
                    </span>
                  </div>
                ) : isMedium ? (
                  <div className="relative z-10 flex flex-col items-center">
                    <span className="text-[10px] font-bold text-white truncate max-w-full leading-tight drop-shadow-md">{rect.item.title}</span>
                    <span className="text-[11px] font-black text-white/90 drop-shadow-md">{Math.round(rect.item.energyScore)}</span>
                  </div>
                ) : (
                  <div className="relative z-10 flex flex-col items-center overflow-hidden w-full">
                    <span className="text-[7px] font-bold text-white/80 truncate max-w-full leading-tight drop-shadow-md">{rect.item.title}</span>
                    <span className="text-[8px] font-black text-white/70 drop-shadow-md">{Math.round(rect.item.energyScore)}</span>
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
