import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Youtube, Twitter, Music, MessageCircle, TrendingUp, ExternalLink, Disc3, MapPin, X, Users, AlertTriangle, ArrowUpRight, Zap } from "lucide-react";
import BoxParticles from "@/components/v3/BoxParticles";
import V3MissionCards from "@/components/v3/V3MissionCards";
import V3NextScheduleCard from "@/components/v3/V3NextScheduleCard";
import V3AIPredictionCard from "@/components/v3/V3AIPredictionCard";
import V3CorrelationPanel from "@/components/v3/V3CorrelationPanel";
import V3CorrelationInsightCard from "@/components/v3/V3CorrelationInsightCard";

export interface InspectorItem {
  id: string;
  slug: string;
  title: string;
  imageUrl: string | null;
  energyScore: number;
  energyChange24h: number;
  totalScore: number;
  youtubeScore: number;
  buzzScore: number;
  twitterScore: number;
  albumSalesScore: number;
  musicScore: number;
  fanScore: number;
  socialScore: number;
  youtubeChange24h: number;
  buzzChange24h: number;
  albumChange24h: number;
  musicChange24h: number;
  fanChange24h: number;
  socialChange24h: number;
  metadata?: any;
  youtubeChannelId?: string | null;
  latestYoutubeVideoId?: string | null;
  latestYoutubeVideoTitle?: string | null;
}

function isSurging(change: number): boolean {
  return change >= 25;
}

function calcPercentChange(now: number, prev: number): number {
  if (prev > 0) return ((now - prev) / prev) * 100;
  if (now > 0) return 100;
  return 0;
}

function ChannelBar({ icon, label, value, total, color, href }: { icon: React.ReactNode; label: string; value: number; total: number; color: string; href?: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  const pctLabel =
    value > 0 && total > 0
      ? pct < 1
        ? "<1%"
        : pct < 10
          ? `${pct.toFixed(1)}%`
          : `${pct.toFixed(0)}%`
      : "0%";

  const content = (
    <div className={cn("space-y-1.5 p-2.5 rounded-xl border border-border bg-muted/40 transition-all", href && "hover:border-primary/40 hover:bg-muted/70 cursor-pointer active:scale-[0.98]")}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-semibold text-foreground">{icon} {label}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-foreground">{Math.round(value)} <span className="text-muted-foreground">({pctLabel})</span></span>
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

export default function V3InspectorPanel({ item, onClose }: { item: InspectorItem; onClose: () => void }) {
  const { t } = useLanguage();
  const navigate = useNavigate();

  const { data: snapshotChanges } = useQuery({
    queryKey: ["inspector-category-changes", item.id],
    enabled: !!item.id,
    staleTime: 30_000,
    queryFn: async () => {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const [latestRes, prevRes] = await Promise.all([
        supabase
          .from("v3_energy_snapshots_v2" as any)
          .select("youtube_score, buzz_score, album_score, music_score, social_score, fan_score, snapshot_at")
          .eq("wiki_entry_id", item.id)
          .order("snapshot_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("v3_energy_snapshots_v2" as any)
          .select("youtube_score, buzz_score, album_score, music_score, social_score, fan_score, snapshot_at")
          .eq("wiki_entry_id", item.id)
          .lte("snapshot_at", oneDayAgo)
          .order("snapshot_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const latest = latestRes.data as any;
      const prev = prevRes.data as any;

      if (!latest || !prev) return null;

      return {
        youtube: calcPercentChange(Number(latest.youtube_score ?? 0), Number(prev.youtube_score ?? 0)),
        buzz: calcPercentChange(Number(latest.buzz_score ?? 0), Number(prev.buzz_score ?? 0)),
        album: calcPercentChange(Number(latest.album_score ?? 0), Number(prev.album_score ?? 0)),
        music: calcPercentChange(Number(latest.music_score ?? 0), Number(prev.music_score ?? 0)),
        social: calcPercentChange(
          Number((latest.social_score ?? latest.fan_score) ?? 0),
          Number((prev.social_score ?? prev.fan_score) ?? 0),
        ),
        fan: calcPercentChange(Number(latest.fan_score ?? 0), Number(prev.fan_score ?? 0)),
      };
    },
  });

  const total = (item.youtubeScore || 0) + (item.buzzScore || 0) + (item.twitterScore || 0) + (item.albumSalesScore || 0) + (item.musicScore || 0) + (item.socialScore || 0);
  const surging = isSurging(item.energyChange24h);

  const encodedName = encodeURIComponent(item.title);
  const musicCharts = item.metadata?.music_charts;
  const latestSong = musicCharts?.spotify?.top_songs?.[0]?.title || musicCharts?.melon?.top_songs?.[0]?.title;
  const musicSearchQuery = latestSong ? encodeURIComponent(`${item.title} ${latestSong}`) : encodedName;

  const channels = [
    { icon: <Youtube className="w-3.5 h-3.5" />, label: item.latestYoutubeVideoTitle ? `YouTube · ${item.latestYoutubeVideoTitle}` : "YouTube", value: item.youtubeScore, color: "hsl(0, 80%, 45%)", change: snapshotChanges?.youtube ?? item.youtubeChange24h, href: item.latestYoutubeVideoId ? `https://www.youtube.com/watch?v=${item.latestYoutubeVideoId}` : item.youtubeChannelId ? `https://www.youtube.com/channel/${item.youtubeChannelId}/videos` : `https://www.youtube.com/results?search_query=${encodedName}` },
    { icon: <MessageCircle className="w-3.5 h-3.5" />, label: "Buzz", value: item.buzzScore, color: "hsl(280, 70%, 45%)", change: snapshotChanges?.buzz ?? item.buzzChange24h, href: `https://x.com/search?q=${encodedName}&src=typed_query` },
    { icon: <Disc3 className="w-3.5 h-3.5" />, label: "Sales", value: item.albumSalesScore, color: "hsl(35, 90%, 42%)", change: snapshotChanges?.album ?? item.albumChange24h },
    { icon: <Music className="w-3.5 h-3.5" />, label: latestSong ? `Music · ${latestSong}` : "Music", value: item.musicScore, color: "hsl(145, 70%, 38%)", change: snapshotChanges?.music ?? item.musicChange24h, href: `https://open.spotify.com/search/${musicSearchQuery}` },
    { icon: <Users className="w-3.5 h-3.5" />, label: "Social", value: item.socialScore, color: "hsl(195, 85%, 45%)", change: snapshotChanges?.social ?? item.socialChange24h },
    { icon: <TrendingUp className="w-3.5 h-3.5" />, label: "Fan Activity", value: item.fanScore, color: "hsl(330, 70%, 50%)", change: snapshotChanges?.fan ?? item.fanChange24h },
  ].filter(c => c.value > 0);

  return (
    <Drawer open onOpenChange={(open) => { if (!open) onClose(); }} handleOnly>
      <DrawerContent className={cn(
        "max-h-[90dvh] lg:max-h-[88vh] rounded-t-2xl border-t mx-auto max-w-[600px] bg-card flex flex-col",
        surging ? "border-destructive/50" : "border-border"
      )}>
        <div className="shrink-0 border-b border-border -mt-1" vaul-drawer-handle="">
          <div className="flex items-center gap-2 px-4 py-3 min-w-0 cursor-grab active:cursor-grabbing">
            {surging && <span className="text-lg animate-fire-burn shrink-0">🔥</span>}
            <p className="text-base font-black text-foreground truncate flex-1">{item.title}</p>
            <button
              onClick={onClose}
              className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-muted/80 hover:bg-muted transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4 text-foreground" />
            </button>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 min-h-0">
          <div className="p-4 space-y-3 overflow-hidden">
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

            {channels.length > 0 && (() => {
              // 약한 카테고리 찾기: 점수가 낮거나 하락 중인 항목
              const boostTargets = channels
                .map(ch => {
                  const shortLabel = ch.label.split(' · ')[0];
                  // 약점 우선순위: 하락 중 > 점수 비중 낮음
                  const weakness = ch.change < -5 ? 3 : ch.change < 0 ? 2 : (ch.value / Math.max(total, 1)) < 0.1 ? 1 : 0;
                  return { ...ch, shortLabel, weakness };
                })
                .filter(ch => ch.weakness > 0)
                .sort((a, b) => b.weakness - a.weakness || a.value - b.value)
                .slice(0, 3);

              const boostTips: Record<string, { tip: string; action: string }> = {
                YouTube: { tip: t("inspector.boost.youtube") || "Increase video uploads & engagement", action: "Watch & Like" },
                Buzz: { tip: t("inspector.boost.buzz") || "Share on X & TikTok to build buzz", action: "Share on X" },
                Sales: { tip: t("inspector.boost.sales") || "Support album sales & streaming charts", action: "Stream Now" },
                Music: { tip: t("inspector.boost.music") || "Listen on Last.fm & Deezer to boost plays", action: "Listen" },
                Social: { tip: t("inspector.boost.social") || "Grow social presence & follower count", action: "Follow" },
                "Fan Activity": { tip: t("inspector.boost.fan") || "Engage on K-Trendz to earn Fan points", action: "Explore" },
              };

              if (boostTargets.length === 0) {
                return (
                  <div className="rounded-xl bg-green-500/5 border border-green-500/20 p-4">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-green-500" />
                      <p className="text-sm font-bold text-green-500">All channels performing well!</p>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">All categories are growing — keep the momentum going.</p>
                  </div>
                );
              }

              return (
                <div className="space-y-2 rounded-xl bg-amber-500/5 border border-amber-500/20 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    <p className="text-sm font-extrabold text-foreground uppercase tracking-wider">Boost Opportunity</p>
                  </div>
                  {boostTargets.map(ch => {
                    const tipData = boostTips[ch.shortLabel] || { tip: "Room for growth", action: "View" };
                    return (
                      <a key={ch.shortLabel} href={ch.href} target="_blank" rel="noopener noreferrer"
                        className="flex items-start gap-3 p-3 rounded-xl border border-border bg-card/60 hover:border-amber-500/30 hover:bg-card transition-all cursor-pointer group">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: `${ch.color}20` }}>
                          {ch.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-foreground">{ch.shortLabel}</span>
                            <span className={cn("text-[10px] font-bold",
                              ch.change < 0 ? "text-red-400" : "text-muted-foreground"
                            )}>
                              {ch.change > 0 ? "+" : ""}{ch.change.toFixed(1)}%
                            </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{tipData.tip}</p>
                        </div>
                        <div className="shrink-0 self-center">
                          <span className="flex items-center gap-0.5 text-[9px] font-bold text-amber-500 group-hover:text-amber-400 transition-colors">
                            {tipData.action} <ArrowUpRight className="w-3 h-3" />
                          </span>
                        </div>
                      </a>
                    );
                  })}
                </div>
              );
            })()}

            <V3AIPredictionCard wikiEntryId={item.id} artistName={item.title} />
            <V3CorrelationInsightCard wikiEntryId={item.id} artistName={item.title} artistSlug={item.slug} />
            <V3CorrelationPanel wikiEntryId={item.id} artistName={item.title} />

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
