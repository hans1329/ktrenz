import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface TreemapItem {
  id: string; slug: string; title: string; imageUrl: string | null;
  energyScore: number; energyChange24h: number; totalScore: number;
  youtubeScore: number; spotifyScore: number; buzzScore: number; twitterScore: number;
  sparkline: number[]; trendLabel: TrendLabel;
}

type TrendLabel = "HOT" | "Up" | "Stable" | "Cooling" | "Down";

function getTrendLabel(change: number, sparkline: number[]): TrendLabel {
  const len = sparkline.length;
  if (len >= 4) {
    const recentHalf = sparkline.slice(Math.floor(len / 2));
    const firstHalf = sparkline.slice(0, Math.floor(len / 2));
    const recentAvg = recentHalf.reduce((a, b) => a + b, 0) / recentHalf.length;
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const acceleration = firstAvg > 0 ? ((recentAvg - firstAvg) / firstAvg) * 100 : 0;
    if (change >= 30 || acceleration >= 40) return "HOT";
  }
  if (change >= 10) return "Up";
  if (change > -5) return "Stable";
  if (change > -15) return "Cooling";
  return "Down";
}

function getTrendBadgeStyle(label: TrendLabel) {
  switch (label) {
    case "HOT": return "bg-red-500/90 text-white";
    case "Up": return "bg-green-500/80 text-white";
    case "Stable": return "bg-muted-foreground/40 text-white/90";
    case "Cooling": return "bg-orange-500/70 text-white";
    case "Down": return "bg-red-600/70 text-white";
  }
}

function getTrendEmoji(label: TrendLabel) {
  switch (label) {
    case "HOT": return "🔥"; case "Up": return "↑"; case "Stable": return "→"; case "Cooling": return "↘"; case "Down": return "↓";
  }
}

function getChangeHSL(change: number): string {
  if (change >= 30) return "hsla(0, 85%, 50%, 0.85)";
  if (change >= 15) return "hsla(145, 65%, 35%, 0.8)";
  if (change >= 5) return "hsla(145, 50%, 30%, 0.65)";
  if (change > -5) return "hsla(220, 20%, 30%, 0.55)";
  if (change > -15) return "hsla(0, 50%, 35%, 0.65)";
  return "hsla(0, 60%, 30%, 0.8)";
}

function MiniSparkline({ data, width, height, color = "rgba(255,255,255,0.5)" }: { data: number[]; width: number; height: number; color?: string }) {
  if (data.length < 2) return null;
  const min = Math.min(...data); const max = Math.max(...data); const range = max - min || 1; const padding = 2;
  const points = data.map((v, i) => { const x = (i / (data.length - 1)) * width; const y = height - padding - ((v - min) / range) * (height - padding * 2); return `${x},${y}`; }).join(" ");
  const areaPoints = `0,${height} ${points} ${width},${height}`;
  return (
    <svg width={width} height={height} className="absolute bottom-0 left-0 opacity-40 pointer-events-none">
      <defs><linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.3" /><stop offset="100%" stopColor={color} stopOpacity="0.05" /></linearGradient></defs>
      <polygon points={areaPoints} fill="url(#sparkFill)" /><polyline points={points} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

interface Rect { x: number; y: number; w: number; h: number; item: TreemapItem; }

function squarify(items: TreemapItem[], x: number, y: number, w: number, h: number): Rect[] {
  if (items.length === 0) return [];
  if (items.length === 1) return [{ x, y, w, h, item: items[0] }];
  const totalValue = items.reduce((s, i) => s + Math.max(i.energyScore, 10), 0);
  const totalArea = w * h;
  const areas = items.map(i => (Math.max(i.energyScore, 10) / totalValue) * totalArea);
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

function InspectorPanel({ item, onClose }: { item: TreemapItem; onClose: () => void }) {
  const navigate = useNavigate();
  const total = (item.youtubeScore || 0) + (item.spotifyScore || 0) + (item.buzzScore || 0) + (item.twitterScore || 0);
  const channels = total > 0 ? [
    { name: "YouTube", pct: ((item.youtubeScore || 0) / total * 100), icon: "🎬" },
    { name: "Spotify", pct: ((item.spotifyScore || 0) / total * 100), icon: "🎵" },
    { name: "Buzz", pct: ((item.buzzScore || 0) / total * 100), icon: "💬" },
    { name: "X", pct: ((item.twitterScore || 0) / total * 100), icon: "𝕏" },
  ].filter(c => c.pct > 0) : [];

  return (
    <div className="mt-3 rounded-2xl border border-border bg-card overflow-hidden animate-fade-in">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div><p className="text-[10px] text-muted-foreground">Inspector</p><p className="text-sm font-bold text-foreground">{item.title}</p></div>
        <div className="flex items-center gap-2">
          <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", getTrendBadgeStyle(item.trendLabel))}>{getTrendEmoji(item.trendLabel)} {item.trendLabel}</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
        </div>
      </div>
      <div className="p-4 space-y-3">
        {channels.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {channels.map(ch => <span key={ch.name} className="text-[10px] px-2 py-1 rounded-full border border-border bg-muted/50">{ch.icon} <b className="text-foreground">{ch.name}</b> {ch.pct.toFixed(0)}%</span>)}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-muted/50 border border-border p-2.5"><p className="text-[10px] text-muted-foreground">Energy Score</p><p className="text-base font-black text-foreground">{Math.round(item.energyScore)}</p></div>
          <div className="rounded-xl bg-muted/50 border border-border p-2.5"><p className="text-[10px] text-muted-foreground">24h Change</p><p className={cn("text-base font-black", item.energyChange24h >= 0 ? "text-green-500" : "text-red-500")}>{item.energyChange24h > 0 ? "+" : ""}{item.energyChange24h.toFixed(1)}%</p></div>
          <div className="rounded-xl bg-muted/50 border border-border p-2.5"><p className="text-[10px] text-muted-foreground">Total Score</p><p className="text-base font-black text-foreground">{Math.round(item.totalScore)}</p></div>
          <div className="rounded-xl bg-muted/50 border border-border p-2.5"><p className="text-[10px] text-muted-foreground">Trend</p><p className="text-base font-black text-foreground">{getTrendEmoji(item.trendLabel)} {item.trendLabel}</p></div>
        </div>
        {item.sparkline.length >= 2 && (
          <div className="rounded-xl bg-muted/30 border border-border p-3">
            <p className="text-[10px] text-muted-foreground mb-1">Score History</p>
            <div className="relative h-16"><MiniSparkline data={item.sparkline} width={320} height={64} color={item.energyChange24h >= 0 ? "hsl(145, 65%, 50%)" : "hsl(0, 65%, 55%)"} /></div>
          </div>
        )}
        <button onClick={() => navigate(`/artist/${item.slug}`)} className="w-full text-center text-xs font-semibold text-primary hover:text-primary/80 py-2 rounded-full border border-primary/30 hover:bg-primary/5 transition-colors">
          View Full Profile →
        </button>
      </div>
    </div>
  );
}

const V3Treemap = () => {
  const [selectedItem, setSelectedItem] = useState<TreemapItem | null>(null);

  const { data: items, isLoading } = useQuery({
    queryKey: ["v3-treemap-data-v2"],
    queryFn: async () => {
      const { data, error } = await supabase.from("v3_scores")
        .select(`wiki_entry_id, total_score, energy_score, energy_change_24h, youtube_score, spotify_score, buzz_score, twitter_score, scored_at,
          wiki_entries:wiki_entry_id (id, title, slug, image_url, metadata)`)
        .order("scored_at", { ascending: false });
      if (error) throw error;
      if (!data?.length) return [];
      const historyMap = new Map<string, number[]>(); const latestMap = new Map<string, any>();
      for (const s of data) {
        if (!latestMap.has(s.wiki_entry_id)) latestMap.set(s.wiki_entry_id, s);
        if (!historyMap.has(s.wiki_entry_id)) historyMap.set(s.wiki_entry_id, []);
        historyMap.get(s.wiki_entry_id)!.push(s.total_score || 0);
      }
      return Array.from(latestMap.values()).map((s) => {
        const entry = s.wiki_entries as any;
        const sparkline = (historyMap.get(s.wiki_entry_id) || []).reverse();
        const change = s.energy_change_24h || 0;
        return {
          id: s.wiki_entry_id, slug: entry?.slug || "", title: entry?.title || "Unknown",
          imageUrl: entry?.image_url || (entry?.metadata as any)?.profile_image || null,
          energyScore: s.energy_score || 0, energyChange24h: change, totalScore: s.total_score || 0,
          youtubeScore: s.youtube_score || 0, spotifyScore: s.spotify_score || 0,
          buzzScore: s.buzz_score || 0, twitterScore: s.twitter_score || 0,
          sparkline, trendLabel: getTrendLabel(change, sparkline),
        };
      }).filter((i) => i.slug).sort((a, b) => b.energyScore - a.energyScore);
    },
    staleTime: 30_000,
  });

  const containerWidth = 360; const containerHeight = 420;
  const rects = useMemo(() => { if (!items?.length) return []; return squarify(items, 0, 0, containerWidth, containerHeight); }, [items]);
  const handleTileClick = useCallback((item: TreemapItem) => { setSelectedItem(prev => prev?.id === item.id ? null : item); }, []);

  if (isLoading) return <div className="px-4 py-6"><Skeleton className="w-full h-[420px] rounded-2xl" /></div>;
  if (!items?.length) return <div className="px-4 py-16 text-center"><p className="text-sm text-muted-foreground">No energy data available yet.</p></div>;

  const totalEnergy = items.reduce((s, i) => s + i.energyScore, 0);

  return (
    <div className="px-4 pb-4">
      <div className="pt-4 pb-3">
        <h2 className="text-xl font-black text-foreground">📊 Energy Map</h2>
        <p className="text-xs text-muted-foreground mt-0.5 pl-7">Size = FES · Color = 24h Change · Tap to inspect</p>
      </div>
      <div className="flex items-center justify-center gap-3 mb-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "hsla(0, 85%, 50%, 0.85)" }} />🔥 HOT</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "hsla(145, 65%, 35%, 0.8)" }} />↑ Up</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "hsla(220, 20%, 30%, 0.55)" }} />→ Stable</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "hsla(0, 50%, 35%, 0.65)" }} />↓ Down</span>
      </div>
      <div className="relative w-full rounded-2xl overflow-hidden border border-border" style={{ aspectRatio: `${containerWidth} / ${containerHeight}` }}>
        <div className="absolute inset-0">
          {rects.map((rect) => {
            const left = (rect.x / containerWidth) * 100; const top = (rect.y / containerHeight) * 100;
            const width = (rect.w / containerWidth) * 100; const height = (rect.h / containerHeight) * 100;
            const isLarge = width > 18 && height > 15; const isMedium = width > 12 && height > 10;
            const isSelected = selectedItem?.id === rect.item.id;
            const sharePct = totalEnergy > 0 ? (rect.item.energyScore / totalEnergy * 100) : 0;
            return (
              <button key={rect.item.id} onClick={() => handleTileClick(rect.item)}
                className={cn("absolute border transition-all duration-200 overflow-hidden flex flex-col items-center justify-center p-1.5",
                  isSelected ? "border-primary ring-2 ring-primary/40 z-20 brightness-110" : "border-background/20 hover:brightness-125 hover:z-10")}
                style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%`, background: getChangeHSL(rect.item.energyChange24h) }}>
                {rect.item.sparkline.length >= 2 && isMedium && <MiniSparkline data={rect.item.sparkline} width={Math.round(rect.w)} height={Math.round(rect.h)} color="rgba(255,255,255,0.5)" />}
                {isLarge ? (
                  <div className="relative z-10 flex flex-col items-center gap-0.5">
                    <span className="text-xs font-bold text-white truncate max-w-full leading-tight drop-shadow-md">{rect.item.title}</span>
                    <span className="text-[11px] font-black text-white/90 drop-shadow-md">{Math.round(rect.item.energyScore)}</span>
                    <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full", getTrendBadgeStyle(rect.item.trendLabel))}>{getTrendEmoji(rect.item.trendLabel)} {sharePct.toFixed(1)}%</span>
                  </div>
                ) : isMedium ? (
                  <div className="relative z-10 flex flex-col items-center">
                    <span className="text-[10px] font-bold text-white truncate max-w-full leading-tight drop-shadow-md">{rect.item.title}</span>
                    <span className="text-[10px] font-black text-white/80 drop-shadow-md">{Math.round(rect.item.energyScore)}</span>
                  </div>
                ) : (
                  <span className="relative z-10 text-[9px] font-bold text-white/70 truncate max-w-full drop-shadow-md">
                    {rect.item.title.length > 6 ? rect.item.title.slice(0, 5) + "…" : rect.item.title}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      {selectedItem && <InspectorPanel item={selectedItem} onClose={() => setSelectedItem(null)} />}
    </div>
  );
};

export default V3Treemap;
