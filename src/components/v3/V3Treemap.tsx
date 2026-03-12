import { useState, useMemo, useCallback, useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTrackEvent } from "@/hooks/useTrackEvent";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { Youtube, Twitter, Music, MessageCircle, TrendingUp, ExternalLink, Disc3, MapPin, Snowflake } from "lucide-react";
import BoxParticles from "@/components/v3/BoxParticles";
import V3MissionCards from "@/components/v3/V3MissionCards";
import V3NextScheduleCard from "@/components/v3/V3NextScheduleCard";
import V3AIPredictionCard from "@/components/v3/V3AIPredictionCard";
import { useAuth } from "@/hooks/useAuth";

// ── Types ──
export type EnergyCategory = "all" | "youtube" | "buzz" | "album" | "music" | "fan";

interface TreemapItem {
  id: string; slug: string; title: string; imageUrl: string | null;
  energyScore: number; energyChange24h: number; totalScore: number;
  youtubeScore: number; buzzScore: number; twitterScore: number;
  albumSalesScore: number; musicScore: number; fanScore: number;
  youtubeChange24h: number; buzzChange24h: number; albumChange24h: number; musicChange24h: number; fanChange24h: number;
  sparkline: number[]; trendLabel: TrendLabel;
  ema7d: number | null; ema30d: number | null;
  metadata?: any;
  youtubeChannelId?: string | null;
  latestYoutubeVideoId?: string | null;
  latestYoutubeVideoTitle?: string | null;
}

type TrendLabel = "🔥 SURGE" | "↑ Rising" | "→ Stable" | "↘ Cooling" | "↓ Falling";

const PENDING_MISSION_KEY = "ktrenz_pending_mission_v1";
const LAST_INSPECTOR_KEY = "ktrenz_last_inspector_artist_v1";
const PENDING_MISSION_TTL_MS = 1000 * 60 * 30;

function hasValidPendingMission(): boolean {
  try {
    const raw = localStorage.getItem(PENDING_MISSION_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!parsed?.createdAt || Date.now() - parsed.createdAt > PENDING_MISSION_TTL_MS) {
      localStorage.removeItem(PENDING_MISSION_KEY);
      return false;
    }
    return true;
  } catch {
    localStorage.removeItem(PENDING_MISSION_KEY);
    return false;
  }
}

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
  if (change >= 30) return "hsla(330, 80%, 55%, 0.9)";
  if (change >= 15) return "hsla(335, 70%, 48%, 0.8)";
  if (change >= 5) return "hsla(340, 55%, 42%, 0.7)";
  if (change > -5) return "hsla(180, 100%, 40%, 0.75)";
  if (change > -15) return "hsla(270, 40%, 50%, 0.7)";
  return "hsla(275, 35%, 42%, 0.75)";
}

function isSurging(change: number): boolean {
  return change >= 25;
}

// ── Category helpers (exported for reuse) ──
export function getCategoryScore(item: TreemapItem, category: EnergyCategory): number {
  switch (category) {
    case "youtube": return item.youtubeScore;
    case "buzz": return item.buzzScore;
    case "album": return item.albumSalesScore;
    case "music": return item.musicScore;
    case "fan": return item.fanScore;
    default: return item.energyScore;
  }
}

export function getCategoryChange(item: TreemapItem, category: EnergyCategory): number {
  switch (category) {
    case "youtube": return item.youtubeChange24h;
    case "buzz": return item.buzzChange24h;
    case "album": return item.albumChange24h;
    case "music": return item.musicChange24h;
    case "fan": return item.fanChange24h;
    default: return item.energyChange24h;
  }
}

const CATEGORY_CONFIG: Record<EnergyCategory, { label: string; icon: React.ReactNode; color: string }> = {
  all: { label: "전체", icon: <TrendingUp className="w-3 h-3" />, color: "hsl(var(--primary))" },
  youtube: { label: "YouTube", icon: <Youtube className="w-3 h-3" />, color: "hsl(0, 70%, 50%)" },
  buzz: { label: "Buzz", icon: <MessageCircle className="w-3 h-3" />, color: "hsl(280, 60%, 55%)" },
  album: { label: "Album", icon: <Disc3 className="w-3 h-3" />, color: "hsl(35, 80%, 50%)" },
  music: { label: "Music", icon: <Music className="w-3 h-3" />, color: "hsl(145, 60%, 45%)" },
  fan: { label: "Fan Activity", icon: <TrendingUp className="w-3 h-3" />, color: "hsl(200, 80%, 50%)" },
};

// ── Sparkline ──
const MiniSparkline = ({ data, width, height, color = "rgba(255,255,255,0.5)", ema7d, ema30d }: { data: number[]; width: number; height: number; color?: string; ema7d?: number | null; ema30d?: number | null }) => {
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
};

// ── Squarify layout ──
interface Rect { x: number; y: number; w: number; h: number; item: TreemapItem; }

function squarify(items: TreemapItem[], x: number, y: number, w: number, h: number, category: EnergyCategory): Rect[] {
  if (items.length === 0) return [];
  if (items.length === 1) return [{ x, y, w, h, item: items[0] }];
  const tileSize = (i: TreemapItem, idx: number) => {
    const score = getCategoryScore(i, category);
    const base = Math.log1p(Math.max(score, 1));
    if (idx === 0) return base * 10.0;
    if (idx === 1) return base * 7.0;
    if (idx === 2) return base * 5.0;
    if (idx === 3) return base * 1.8;
    if (idx === 4) return base * 1.5;
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
  if (href) return <a href={href} target="_blank" rel="noopener noreferrer" data-track-category={label}>{content}</a>;
  return content;
}

// ── Inspector Panel ──
function InspectorPanel({ item, onClose }: { item: TreemapItem; onClose: () => void }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  
  const total = (item.youtubeScore || 0) + (item.buzzScore || 0) + (item.twitterScore || 0) + (item.albumSalesScore || 0) + (item.musicScore || 0);
  const surging = isSurging(item.energyChange24h);

  const encodedName = encodeURIComponent(item.title);
  const musicCharts = item.metadata?.music_charts;
  const latestSong = musicCharts?.spotify?.top_songs?.[0]?.title || musicCharts?.melon?.top_songs?.[0]?.title;
  const musicSearchQuery = latestSong ? encodeURIComponent(`${item.title} ${latestSong}`) : encodedName;

  const channels = [
    { icon: <Youtube className="w-3.5 h-3.5" />, label: item.latestYoutubeVideoTitle ? `YouTube · ${item.latestYoutubeVideoTitle}` : "YouTube", value: item.youtubeScore, color: "hsl(0, 80%, 45%)", change: item.youtubeChange24h, href: item.latestYoutubeVideoId ? `https://www.youtube.com/watch?v=${item.latestYoutubeVideoId}` : item.youtubeChannelId ? `https://www.youtube.com/channel/${item.youtubeChannelId}/videos` : `https://www.youtube.com/results?search_query=${encodedName}` },
    { icon: <MessageCircle className="w-3.5 h-3.5" />, label: "Buzz", value: item.buzzScore, color: "hsl(280, 70%, 45%)", change: item.buzzChange24h, href: `https://x.com/search?q=${encodedName}&src=typed_query` },
    { icon: <Disc3 className="w-3.5 h-3.5" />, label: "Album Sales", value: item.albumSalesScore, color: "hsl(35, 90%, 42%)", change: item.albumChange24h },
    { icon: <Music className="w-3.5 h-3.5" />, label: latestSong ? `Music · ${latestSong}` : "Music", value: item.musicScore, color: "hsl(145, 70%, 38%)", change: item.musicChange24h, href: `https://open.spotify.com/search/${musicSearchQuery}` },
    { icon: <TrendingUp className="w-3.5 h-3.5" />, label: "Fan Activity", value: item.fanScore, color: "hsl(200, 80%, 50%)", change: item.fanChange24h },
  ].filter(c => c.value > 0);

  return (
    <Drawer open onOpenChange={(open) => { if (!open) onClose(); }} handleOnly>
      <DrawerContent className={cn(
        "max-h-[75vh] lg:max-h-[92vh] rounded-t-2xl border-t mx-auto max-w-[600px] bg-card flex flex-col",
        surging ? "border-destructive/50" : "border-border"
      )}>
        {/* Drag handle + title = draggable zone */}
        <div className="shrink-0 border-b border-border -mt-1" vaul-drawer-handle="">
          <div className="flex items-center gap-2 px-4 py-3 min-w-0 cursor-grab active:cursor-grabbing">
            {surging && <span className="text-lg animate-fire-burn shrink-0">🔥</span>}
            <p className="text-base font-black text-foreground truncate">{item.title}</p>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 min-h-0">
          <div className="p-4 space-y-5 overflow-hidden">
            {/* Surging Location Box */}
            {surging && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-pink-500/10 border border-pink-500/30">
                <MapPin className="w-4 h-4 text-pink-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-pink-400">{t("drawer.surgingLocation")}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {(() => {
                      const surgingCats = channels.filter(ch => ch.change >= 15);
                      if (surgingCats.length === 0) return `FES +${item.energyChange24h.toFixed(1)}%`;
                      return surgingCats.map(ch => `${ch.label.split(' · ')[0]} +${ch.change.toFixed(1)}%`).join(', ');
                    })()}
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-muted/50 border border-border p-3 text-center overflow-hidden">
                <p className="text-[10px] text-muted-foreground mb-1">{t("drawer.fesLabel")}</p>
                <p className="text-xl font-black text-foreground truncate">{Math.round(item.energyScore)}°</p>
              </div>
              <div className="rounded-xl bg-muted/50 border border-border p-3 text-center overflow-hidden">
                <p className="text-[10px] text-muted-foreground mb-1">{t("drawer.change24h")}</p>
                <p className={cn("text-lg font-black truncate",
                  item.energyChange24h >= 15 ? "text-destructive" : item.energyChange24h >= 0 ? "text-green-500" : "text-blue-400"
                )}>
                  {item.energyChange24h > 0 ? "+" : ""}{item.energyChange24h.toFixed(1)}%
                </p>
              </div>
            </div>

            {channels.length > 0 && (
              <div className="space-y-3 rounded-xl bg-muted/30 border border-border p-4 my-2">
                <p className="text-base text-foreground uppercase tracking-wider font-extrabold flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" /> {t("drawer.categoryChanges")}
                </p>
                {/* Animated stacked bar with countup + shake on top category */}
                {(() => {
                  const changeChannels = channels.map(ch => ({ ...ch, absChange: Math.abs(ch.change) }));
                  const totalChange = changeChannels.reduce((sum, ch) => sum + ch.absChange, 0);
                  const activeChannels = changeChannels.filter(ch => ch.absChange > 0);
                  if (activeChannels.length === 0 || totalChange === 0) return null;

                  // Find the dominant category (highest absolute change)
                  const maxChange = Math.max(...activeChannels.map(ch => ch.absChange));
                  const dominantIndex = activeChannels.findIndex(ch => ch.absChange === maxChange);

                  // Build gradient stops
                  const stops: { offset: string; color: string }[] = [];
                  let cumPct = 0;
                  const blendSize = 3;
                  activeChannels.forEach((ch, i) => {
                    const pct = (ch.absChange / totalChange) * 100;
                    if (i === 0) {
                      stops.push({ offset: `${cumPct}%`, color: ch.color });
                    } else {
                      stops.push({ offset: `${Math.max(cumPct - blendSize, 0)}%`, color: activeChannels[i - 1].color });
                      stops.push({ offset: `${Math.min(cumPct + blendSize, 100)}%`, color: ch.color });
                    }
                    cumPct += pct;
                  });
                  stops.push({ offset: `100%`, color: activeChannels[activeChannels.length - 1].color });
                  const gradId = `cat-grad-${item.id}`;

                  // Calculate dominant segment boundaries for glow overlay
                  let domStart = 0;
                  for (let i = 0; i < dominantIndex; i++) {
                    domStart += (activeChannels[i].absChange / totalChange) * 200;
                  }
                  const domWidth = (activeChannels[dominantIndex].absChange / totalChange) * 200;

                  const domLeftPct = (domStart / 200) * 100;
                  const domWidthPct = (domWidth / 200) * 100;

                  return (
                    <div className="relative">
                      <svg className="w-full h-7" preserveAspectRatio="none" viewBox="0 0 200 14"
                        style={{ borderRadius: '9999px', overflow: 'hidden', display: 'block' }}>
                        <defs>
                          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
                            {stops.map((s, i) => <stop key={i} offset={s.offset} stopColor={s.color} />)}
                          </linearGradient>
                        </defs>
                        {/* Background track */}
                        <rect x="0" y="0" width="200" height="14" rx="7" ry="7" fill="hsl(var(--muted))" opacity="0.3" />
                        {/* Animated fill bar — countup from 0 to full width */}
                        <rect x="0" y="0" width="200" height="14" rx="7" ry="7" fill={`url(#${gradId})`}>
                          <animate attributeName="width" from="0" to="200" dur="0.8s" fill="freeze"
                            calcMode="spline" keySplines="0.25 0.1 0.25 1" keyTimes="0;1" />
                        </rect>
                      </svg>
                      {/* Particle overlay on dominant segment */}
                      <div className="absolute top-0 pointer-events-none"
                        style={{
                          left: `${domLeftPct}%`,
                          width: `${domWidthPct}%`,
                          height: '100%',
                          borderRadius: '9999px',
                          overflow: 'hidden',
                        }}>
                        <BoxParticles
                          count={18}
                          color="hsl(0, 0%, 95%)"
                          speed={0.4}
                          density={0.45}
                        />
                      </div>
                    </div>
                  );
                })()}
                {/* Legend with change % */}
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {(() => {
                    const maxAbsChange = Math.max(...channels.map(ch => Math.abs(ch.change)));
                    return channels.map(ch => {
                      const shortLabel = ch.label.split(' · ')[0];
                      const isDominant = Math.abs(ch.change) === maxAbsChange && maxAbsChange > 0;
                      return (
                        <a key={ch.label} href={ch.href} target="_blank" rel="noopener noreferrer"
                          className={cn(
                            "flex items-center justify-between px-2.5 py-2 rounded-lg border transition-colors",
                            "bg-card/50 border-border/50 hover:border-border",
                            ch.href && "cursor-pointer",
                            isDominant && "border-primary/30 bg-primary/5 animate-[shake_0.5s_ease-in-out_1s_1]"
                          )}>
                          <span className="flex items-center gap-1.5 text-[10px] font-semibold text-foreground">
                            <span className={cn("w-2.5 h-2.5 rounded-sm shrink-0", isDominant && "animate-pulse")}
                              style={{ background: ch.color }} />
                            {ch.icon} {shortLabel}
                          </span>
                          <span className={cn("text-[10px] font-bold",
                            ch.change > 0 ? "text-green-500" : ch.change < 0 ? "text-red-400" : "text-muted-foreground",
                            isDominant && "text-[11px]"
                          )}>
                            {ch.change > 0 ? "+" : ""}{ch.change.toFixed(1)}%
                          </span>
                        </a>
                      );
                    });
                  })()}
                </div>
              </div>
            )}

            {/* AI Fan Sunbae Card — right after category changes */}
            <V3AIPredictionCard wikiEntryId={item.id} artistName={item.title} />




            {/* Today's Mission */}
            <V3MissionCards
              wikiEntryId={item.id}
              artistName={item.title}
              videoId={item.latestYoutubeVideoId || null}
              videoTitle={item.latestYoutubeVideoTitle || null}
              channelId={item.youtubeChannelId || null}
              metadata={item.metadata}
            />

            <V3NextScheduleCard wikiEntryId={item.id} artistImage={item.imageUrl} artistName={item.title} />

            <button onClick={() => navigate(`/artist/${item.slug}`)}
              className="w-full flex items-center justify-center gap-2 text-sm font-bold text-primary-foreground bg-primary hover:bg-primary/90 py-3.5 rounded-full transition-colors">
              <ExternalLink className="w-4 h-4" /> View Full Profile
            </button>
            <div className="h-3" />
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// ── Main Treemap Component ──
const V3Treemap = ({ category: externalCategory, onCategoryChange }: { category?: EnergyCategory; onCategoryChange?: (cat: EnergyCategory) => void } = {}) => {
  const [internalCategory, setInternalCategory] = useState<EnergyCategory>("all");
  const category = externalCategory ?? internalCategory;
  const handleCategoryChange = (cat: EnergyCategory) => {
    setInternalCategory(cat);
    onCategoryChange?.(cat);
  };
  const [selectedItem, setSelectedItem] = useState<TreemapItem | null>(null);
  const [restoreAttempted, setRestoreAttempted] = useState(false);
  const isMobile = useIsMobile();
  const { user } = useAuth();
  // 상승 10 + 보합 5 + 하락 8 = 23 고정
  const RISING_COUNT = 10;
  const FLAT_COUNT = 5;
  const FALLING_COUNT = 8;
  const displayCount = RISING_COUNT + FLAT_COUNT + FALLING_COUNT;

  // Fetch user's agent slots
  const { data: agentSlots } = useQuery({
    queryKey: ["treemap-agent-slots", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from("ktrenz_agent_slots" as any)
        .select("wiki_entry_id")
        .eq("user_id", user.id)
        .not("wiki_entry_id", "is", null)
        .order("updated_at", { ascending: false });
      return (data as any[]) ?? [];
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  const agentWikiIds = useMemo(() => new Set((agentSlots || []).map((s: any) => s.wiki_entry_id).filter(Boolean)), [agentSlots]);

  const { data: items, isLoading } = useQuery({
    queryKey: ["v3-treemap-data-v2", displayCount],
    queryFn: async () => {
      // Tier 1 아티스트만 가져오기
      const { data: tier1Entries } = await supabase
        .from("v3_artist_tiers" as any)
        .select("wiki_entry_id")
        .eq("tier", 1);
      const tier1Ids = new Set((tier1Entries || []).map((t: any) => t.wiki_entry_id));

      const { data, error } = await supabase.from("v3_scores_v2" as any)
        .select(`wiki_entry_id, total_score, energy_score, energy_change_24h,
          youtube_score, buzz_score, album_sales_score, music_score, fan_score,
          youtube_change_24h, buzz_change_24h, album_change_24h, music_change_24h, fan_change_24h,
          scored_at,
          wiki_entries:wiki_entry_id (id, title, slug, image_url, metadata)`)
        .order("total_score", { ascending: false })
        .limit(100);
      if (error) throw error;
      if (!data?.length) return [];
      const typedData = (data as any[]).filter(s => tier1Ids.has(s.wiki_entry_id));
      const latestMap = new Map<string, any>();
      for (const s of typedData) {
        if (!latestMap.has(s.wiki_entry_id)) latestMap.set(s.wiki_entry_id, s);
      }

      const allCandidates = Array.from(latestMap.values())
        .filter((s) => (s.wiki_entries as any)?.slug);
      
      // Tier 1 전체에서 상승/하락/보합 뽑기 위해 전부 가져옴
      const allByChange = [...allCandidates].sort(
        (a, b) => (b.energy_change_24h || 0) - (a.energy_change_24h || 0)
      );
      const topItems = allByChange; // 전체 후보 유지, 뽑기는 useMemo에서
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
          fanScore: s.fan_score || 0,
          youtubeChange24h: s.youtube_change_24h || 0,
          buzzChange24h: s.buzz_change_24h || 0,
          albumChange24h: s.album_change_24h || 0,
          musicChange24h: s.music_change_24h || 0,
          fanChange24h: s.fan_change_24h || 0,
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

  const rememberInspectorItem = useCallback((itemId: string) => {
    try {
      localStorage.setItem(LAST_INSPECTOR_KEY, itemId);
    } catch {
      // no-op
    }
  }, []);

  const clearRememberedInspectorItem = useCallback(() => {
    try {
      localStorage.removeItem(LAST_INSPECTOR_KEY);
    } catch {
      // no-op
    }
  }, []);

  useEffect(() => {
    if (restoreAttempted || selectedItem || !items?.length) return;
    setRestoreAttempted(true);
    if (!hasValidPendingMission()) return;

    const rememberedId = localStorage.getItem(LAST_INSPECTOR_KEY);
    if (!rememberedId) return;

    const matched = items.find((item) => item.id === rememberedId);
    if (matched) {
      setSelectedItem(matched);
    }
  }, [items, restoreAttempted, selectedItem]);

  // 전체 Tier1에서 상승/보합/하락 각각 뽑아서 23개 구성
  const sortedItems = useMemo(() => {
    if (!items?.length) return [];

    const base = category === "all"
      ? items.filter((item) => Number(item.youtubeScore ?? 0) > 0)
      : items;

    const rising: TreemapItem[] = [];
    const flat: TreemapItem[] = [];
    const falling: TreemapItem[] = [];

    for (const item of base) {
      const change = getCategoryChange(item, category);
      if (change > 2) rising.push(item);
      else if (change < -2) falling.push(item);
      else flat.push(item);
    }

    // 각 그룹 내 정렬
    rising.sort((a, b) => getCategoryChange(b, category) - getCategoryChange(a, category));
    flat.sort((a, b) => getCategoryScore(b, category) - getCategoryScore(a, category));
    falling.sort((a, b) => getCategoryChange(a, category) - getCategoryChange(b, category));

    // 상위 N개씩 뽑되, 부족하면 다른 그룹에서 채움
    const pickedRising = rising.slice(0, RISING_COUNT);
    const pickedFlat = flat.slice(0, FLAT_COUNT);
    const pickedFalling = falling.slice(0, FALLING_COUNT);

    let result = [...pickedRising, ...pickedFlat, ...pickedFalling];
    const pickedIds = new Set(result.map(r => r.id));

    // 23개 미달 시 남은 후보에서 change 내림차순으로 채움
    if (result.length < displayCount) {
      const remaining = base
        .filter(item => !pickedIds.has(item.id))
        .sort((a, b) => getCategoryChange(b, category) - getCategoryChange(a, category));
      for (const item of remaining) {
        if (result.length >= displayCount) break;
        result.push(item);
      }
    }

    // Ensure agent artists are included (replace last non-agent item if needed)
    if (agentWikiIds.size > 0) {
      for (const agentId of agentWikiIds) {
        if (result.find(r => r.id === agentId)) continue; // already in list
        const agentItem = base.find(item => item.id === agentId);
        if (!agentItem) continue;
        // Replace last non-agent item
        const lastNonAgentIdx = [...result].reverse().findIndex(r => !agentWikiIds.has(r.id));
        if (lastNonAgentIdx >= 0) {
          result[result.length - 1 - lastNonAgentIdx] = agentItem;
        } else {
          result.push(agentItem);
        }
      }
    }

    // If agent artist is NOT in top 3, move it to the middle of the array
    const agentInResult = result.filter(r => agentWikiIds.has(r.id));
    for (const agentItem of agentInResult) {
      const idx = result.indexOf(agentItem);
      if (idx >= 3) {
        // Remove from current position and insert at middle
        result.splice(idx, 1);
        const midIdx = Math.floor(result.length / 2);
        result.splice(midIdx, 0, agentItem);
      }
    }

    return result;
  }, [items, category, agentWikiIds]);

  const containerWidth = isMobile ? 360 : 420;
  const containerHeight = isMobile ? 620 : 520;
  const rects = useMemo(() => {
    if (!sortedItems.length) return [];
    return squarify(sortedItems, 0, 0, containerWidth, containerHeight, category);
  }, [sortedItems, containerWidth, containerHeight, category]);

  const track = useTrackEvent();
  const handleTileClick = useCallback((item: TreemapItem) => {
    setSelectedItem((prev) => {
      const next = prev?.id === item.id ? null : item;
      if (next) {
        rememberInspectorItem(next.id);
      } else {
        clearRememberedInspectorItem();
      }
      return next;
    });

    track("treemap_click", { artist_slug: item.slug, artist_name: item.title });
  }, [track, rememberInspectorItem, clearRememberedInspectorItem]);

  const handleInspectorClose = useCallback(() => {
    setSelectedItem(null);
    clearRememberedInspectorItem();
  }, [clearRememberedInspectorItem]);

  if (isLoading) return (
    <div className="px-4 pb-4">
      <div className="pt-4 pb-3">
        <Skeleton className="h-7 w-40 mb-1" />
        <Skeleton className="h-4 w-64 ml-7" />
      </div>
      <div className="flex items-center justify-center gap-4 mb-3">
        {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-7 w-14 rounded-full" />)}
      </div>
      <div className="relative w-full rounded-2xl overflow-hidden border border-border" style={{ aspectRatio: `${containerWidth} / 520` }}>
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
      <div className="pt-4 pb-3">
        <h2 className="text-xl font-bold text-muted-foreground">Energy Map</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          카테고리별 24h 변동률 · Top {displayCount} · Tap to inspect
        </p>
      </div>

      <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1 scrollbar-hide">
        {(Object.keys(CATEGORY_CONFIG) as EnergyCategory[]).map((cat) => {
          const config = CATEGORY_CONFIG[cat];
          const isActive = category === cat;
          return (
            <button key={cat} onClick={() => handleCategoryChange(cat)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all border",
                isActive ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground"
              )}>
              {config.icon}
              {config.label}
            </button>
          );
        })}
      </div>

      {selectedItem && <InspectorPanel item={selectedItem} onClose={handleInspectorClose} />}

      <div className="relative w-full rounded-2xl overflow-hidden border border-border" style={{ aspectRatio: `${containerWidth} / ${containerHeight}` }}>
        <svg width="0" height="0" className="absolute">
          <defs>
            <linearGradient id="flameGradient" x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#f97316" />
              <stop offset="50%" stopColor="#fb923c" />
              <stop offset="100%" stopColor="#fde047" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0">
          {rects.map((rect, rectIndex) => {
            const left = (rect.x / containerWidth) * 100; const top = (rect.y / containerHeight) * 100;
            const width = (rect.w / containerWidth) * 100; const height = (rect.h / containerHeight) * 100;
            const isLarge = width > 18 && height > 15; const isMedium = width > 10 && height > 8;
            const isSelected = selectedItem?.id === rect.item.id;
            const catChange = getCategoryChange(rect.item, category);
            const catScore = getCategoryScore(rect.item, category);
            const surging = isSurging(catChange);
            const isFirst = rectIndex === 0;
            const isAgentArtist = agentWikiIds.has(rect.item.id);

            // 박스 크기에 비례한 동적 폰트 크기 계산
             const boxArea = width * height;
             const sizeFactor = Math.sqrt(boxArea) / 10;
             const isTopThree = rectIndex < 3;
             const titleSize = isTopThree 
               ? Math.max(12, Math.min(32, sizeFactor * 4.2))
               : Math.max(9, Math.min(26, sizeFactor * 3.2));
             const scoreSize = Math.max(10, Math.min(34, sizeFactor * 3.8));
            const badgeFontSize = Math.max(9, Math.min(16, sizeFactor * 2.0));
            const badgePx = Math.max(6, Math.min(16, sizeFactor * 1.8));
            const badgePy = Math.max(1, Math.min(4, sizeFactor * 0.6));
            const titleOpacity = Math.max(0.6, Math.min(1, sizeFactor / 4));
            const scoreOpacity = Math.max(0.6, Math.min(0.95, sizeFactor / 4.5));

            // Agent artist gets a distinct blue tile color
            const tileColor = isAgentArtist && !isTopThree
              ? "hsla(210, 80%, 50%, 0.85)"
              : getTileColor(catChange);

            return (
              <button key={rect.item.id} onClick={() => handleTileClick(rect.item)}
                className={cn(
                  "absolute border flex flex-col items-center justify-center p-1.5 outline-none focus:outline-none focus-visible:outline-none",
                  isTopThree ? "overflow-visible" : "overflow-hidden",
                  isSelected ? "border-primary ring-2 ring-primary/40 z-20 brightness-110" : "border-background/20 hover:brightness-125 hover:z-10"
                )}
                style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%`, background: tileColor }}>

                {/* 1등 박스 인너 글로우 */}
                {isFirst && (
                  <div className="absolute inset-0 z-[1] pointer-events-none" style={{
                    boxShadow: 'inset 0 0 25px 8px hsla(0, 0%, 100%, 0.7), inset 0 0 50px 16px hsla(0, 0%, 100%, 0.4), inset 0 0 80px 25px hsla(0, 0%, 100%, 0.2)',
                    background: 'radial-gradient(ellipse at center, hsla(0, 0%, 100%, 0.15) 0%, transparent 60%)',
                  }} />
                )}

                {/* Agent artist blue inner glow */}
                {isAgentArtist && !isTopThree && (
                  <div className="absolute inset-0 z-[1] pointer-events-none" style={{
                    boxShadow: 'inset 0 0 20px 6px hsla(210, 80%, 60%, 0.5), inset 0 0 40px 12px hsla(210, 80%, 60%, 0.25)',
                    background: 'radial-gradient(ellipse at center, hsla(210, 80%, 70%, 0.15) 0%, transparent 60%)',
                  }} />
                )}

                {isMedium && (() => {
                  const absChange = Math.abs(catChange);
                  const isTop3 = rectIndex <= 2;
                  const baseCount = isTop3
                    ? Math.max(30, Math.round((absChange / maxAbsChange) * 65))
                    : Math.max(3, Math.round((absChange / maxAbsChange) * 18));
                  return (
                    <BoxParticles
                      count={baseCount}
                      speed={Math.max(0.1, Math.min(1, absChange / maxAbsChange))}
                      density={isTop3 ? 0.75 : 0.5}
                      color="hsl(0, 0%, 100%)"
                    />
                  );
                })()}

                {rect.item.sparkline.length >= 2 && isMedium && (
                  <MiniSparkline data={rect.item.sparkline} width={Math.round(rect.w)} height={Math.round(rect.h)}
                    color={catChange >= 0 ? "rgba(255,255,255,0.45)" : "rgba(150,180,255,0.45)"}
                    ema7d={rect.item.ema7d} ema30d={rect.item.ema30d} />
                )}

                {isMedium && catChange !== 0 && (
                  <span className={cn(
                    "absolute top-1 right-1 z-20 text-[8px] md:text-[10px] font-bold drop-shadow-md",
                    catChange >= 15 ? "text-white" : catChange > 0 ? "text-green-200" : "text-blue-200"
                  )}>
                    {catChange > 0 ? "▲" : "▼"}{Math.abs(catChange).toFixed(1)}%
                  </span>
                )}

                <div
                  className="relative z-10 flex flex-col items-center w-full px-0.5"
                  style={{ gap: `${Math.max(0, sizeFactor * 0.2)}px`, overflow: "visible" }}
                >
                  {isTopThree && (
                    <span
                      className="block"
                      style={{
                        fontSize: `${Math.max(18, sizeFactor * (rectIndex === 0 ? 4 : 2))}px`,
                        lineHeight: 1,
                        filter: "drop-shadow(0 0 6px rgba(251, 146, 60, 0.7))",
                        animation: "pulse 2s cubic-bezier(0.4,0,0.6,1) infinite",
                        animationDelay: `${rectIndex * 0.7}s`,
                      }}
                    >🔥</span>
                  )}
                  <span className="font-black text-white truncate w-full text-center leading-tight drop-shadow-lg"
                    style={{ fontSize: `${titleSize}px`, opacity: titleOpacity, textShadow: '0 2px 4px rgba(0,0,0,0.2), 0 3px 6px rgba(0,0,0,0.1)' }}>{rect.item.title}</span>
                  <span className="font-black text-white drop-shadow-lg"
                    style={{ fontSize: `${scoreSize}px`, opacity: scoreOpacity, textShadow: '0 2px 4px rgba(0,0,0,0.2), 0 3px 6px rgba(0,0,0,0.1)' }}>{Math.round(catScore)}°</span>
                  {isLarge && (
                    <span className={cn("font-bold rounded-full backdrop-blur-sm",
                      surging ? "bg-white/20 text-white" : "bg-black/30 text-white/80"
                    )} style={{ fontSize: `${badgeFontSize}px`, padding: `${badgePy}px ${badgePx}px` }}>
                      {catChange > 0 ? "+" : ""}{catChange.toFixed(1)}%
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default V3Treemap;
