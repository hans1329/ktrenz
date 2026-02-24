import { useState, useMemo, useCallback } from "react";
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
  youtubeScore: number; spotifyScore: number; buzzScore: number; twitterScore: number;
  sparkline: number[]; trendLabel: TrendLabel;
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
  if (change > -5) return "hsla(145, 55%, 30%, 0.7)";     // GREEN stable
  if (change > -15) return "hsla(220, 55%, 35%, 0.7)";    // BLUE cooling
  return "hsla(230, 60%, 28%, 0.8)";                       // DEEP BLUE falling
}

function isSurging(change: number): boolean {
  return change >= 25;
}

// ── Sparkline ──
function MiniSparkline({ data, width, height, color = "rgba(255,255,255,0.5)" }: { data: number[]; width: number; height: number; color?: string }) {
  if (data.length < 2) return null;
  const min = Math.min(...data); const max = Math.max(...data); const range = max - min || 1; const padding = 2;
  const points = data.map((v, i) => { const x = (i / (data.length - 1)) * width; const y = height - padding - ((v - min) / range) * (height - padding * 2); return `${x},${y}`; }).join(" ");
  const areaPoints = `0,${height} ${points} ${width},${height}`;
  return (
    <svg width={width} height={height} className="absolute bottom-0 left-0 opacity-50 pointer-events-none">
      <defs><linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.3" /><stop offset="100%" stopColor={color} stopOpacity="0.05" /></linearGradient></defs>
      <polygon points={areaPoints} fill="url(#sparkFill)" /><polyline points={points} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

// ── Squarify layout ──
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

// ── Channel Bar ──
function ChannelBar({ icon, label, value, total, color }: { icon: React.ReactNode; label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">{icon} {label}</span>
        <span className="text-[11px] font-bold text-foreground">{pct.toFixed(0)}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

// ── Inspector Panel (enhanced) ──
function InspectorPanel({ item, onClose }: { item: TreemapItem; onClose: () => void }) {
  const navigate = useNavigate();
  const total = (item.youtubeScore || 0) + (item.spotifyScore || 0) + (item.buzzScore || 0) + (item.twitterScore || 0);
  const surging = isSurging(item.energyChange24h);

  const channels = [
    { icon: <Youtube className="w-3.5 h-3.5" />, label: "YouTube", value: item.youtubeScore, color: "hsl(0, 70%, 50%)" },
    { icon: <Music className="w-3.5 h-3.5" />, label: "Spotify", value: item.spotifyScore, color: "hsl(141, 73%, 42%)" },
    { icon: <MessageCircle className="w-3.5 h-3.5" />, label: "Buzz", value: item.buzzScore, color: "hsl(280, 60%, 55%)" },
    { icon: <Twitter className="w-3.5 h-3.5" />, label: "X", value: item.twitterScore, color: "hsl(203, 89%, 53%)" },
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

      <div className="p-4 space-y-4">
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
          <div className="space-y-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Energy Heat Channels
            </p>
            <div className="space-y-2.5">
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
            <div className="relative h-16">
              <MiniSparkline data={item.sparkline} width={320} height={64}
                color={item.energyChange24h >= 15 ? "hsl(0, 80%, 60%)" : item.energyChange24h >= 0 ? "hsl(145, 65%, 50%)" : "hsl(220, 70%, 60%)"} />
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
      }).filter((i) => i.slug).sort((a, b) => b.energyScore - a.energyScore).slice(0, 10); // TOP 10 ONLY
    },
    staleTime: 30_000,
  });

  const containerWidth = 360; const containerHeight = 460;
  const rects = useMemo(() => { if (!items?.length) return []; return squarify(items, 0, 0, containerWidth, containerHeight); }, [items]);
  const handleTileClick = useCallback((item: TreemapItem) => { setSelectedItem(prev => prev?.id === item.id ? null : item); }, []);

  if (isLoading) return <div className="px-4 py-6"><Skeleton className="w-full h-[460px] rounded-2xl" /></div>;
  if (!items?.length) return <div className="px-4 py-16 text-center"><p className="text-sm text-muted-foreground">No energy data available yet.</p></div>;

  const totalEnergy = items.reduce((s, i) => s + i.energyScore, 0);
  const maxEnergy = items.length > 0 ? Math.max(...items.map(i => i.energyScore)) : 1;
  const maxChange = items.length > 0 ? Math.max(...items.map(i => i.energyChange24h), 1) : 1;

  return (
    <div className="px-4 pb-4">
      {/* Header */}
      <div className="pt-4 pb-3">
        <h2 className="text-xl font-black text-foreground">⚡ Energy Map</h2>
        <p className="text-xs text-muted-foreground mt-0.5 pl-7">
          지금 어디서 폭발하고 있나? · Top 10 · Tap to inspect
        </p>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mb-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "hsla(0, 85%, 50%, 0.9)" }} />
          <span className="font-semibold">Rising</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "hsla(145, 55%, 30%, 0.7)" }} />
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
            const isLarge = width > 18 && height > 15; const isMedium = width > 12 && height > 10;
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
                    color={rect.item.energyChange24h >= 0 ? "rgba(255,255,255,0.45)" : "rgba(150,180,255,0.45)"} />
                )}

                {isLarge ? (
                  <div className="relative z-10 flex flex-col items-center gap-0.5">
                    <span className="text-xs font-black text-white truncate max-w-full leading-tight drop-shadow-lg">{rect.item.title}</span>
                    <span className="text-base font-black text-white/95 drop-shadow-lg">{Math.round(rect.item.energyScore)}</span>
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
                  <span className="relative z-10 text-[9px] font-bold text-white/70 truncate max-w-full drop-shadow-md">
                    {rect.item.title.length > 6 ? rect.item.title.slice(0, 5) + "…" : rect.item.title}
                  </span>
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
