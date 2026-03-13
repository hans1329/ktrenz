import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigate } from "react-router-dom";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { Youtube, Twitter, Music, MessageCircle, TrendingUp, ExternalLink, Disc3, MapPin, X } from "lucide-react";
import BoxParticles from "@/components/v3/BoxParticles";
import V3MissionCards from "@/components/v3/V3MissionCards";
import V3NextScheduleCard from "@/components/v3/V3NextScheduleCard";
import V3AIPredictionCard from "@/components/v3/V3AIPredictionCard";
import V3CorrelationPanel from "@/components/v3/V3CorrelationPanel";

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
  youtubeChange24h: number;
  buzzChange24h: number;
  albumChange24h: number;
  musicChange24h: number;
  fanChange24h: number;
  metadata?: any;
  youtubeChannelId?: string | null;
  latestYoutubeVideoId?: string | null;
  latestYoutubeVideoTitle?: string | null;
}

function isSurging(change: number): boolean {
  return change >= 25;
}

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

export default function V3InspectorPanel({ item, onClose }: { item: InspectorItem; onClose: () => void }) {
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
        "max-h-[95dvh] lg:max-h-[92vh] rounded-t-2xl border-t mx-auto max-w-[600px] bg-card flex flex-col",
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
          <div className="p-4 space-y-5 overflow-hidden">
            {surging && (
              <>
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
                <div className="w-12 h-px bg-border mx-auto" />
              </>
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

            <div className="w-12 h-px bg-border mx-auto" />

            {channels.length > 0 && (
              <>
                <div className="space-y-3 rounded-xl bg-muted/30 border border-border p-4 my-2">
                  <p className="text-base text-foreground uppercase tracking-wider font-extrabold flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" /> {t("drawer.categoryChanges")}
                  </p>
                  {(() => {
                    const changeChannels = channels.map(ch => ({ ...ch, absChange: Math.abs(ch.change) }));
                    const totalChange = changeChannels.reduce((sum, ch) => sum + ch.absChange, 0);
                    const activeChannels = changeChannels.filter(ch => ch.absChange > 0);
                    if (activeChannels.length === 0 || totalChange === 0) return null;

                    const maxChange = Math.max(...activeChannels.map(ch => ch.absChange));
                    const dominantIndex = activeChannels.findIndex(ch => ch.absChange === maxChange);

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
                          <rect x="0" y="0" width="200" height="14" rx="7" ry="7" fill="hsl(var(--muted))" opacity="0.3" />
                          <rect x="0" y="0" width="200" height="14" rx="7" ry="7" fill={`url(#${gradId})`}>
                            <animate attributeName="width" from="0" to="200" dur="0.8s" fill="freeze"
                              calcMode="spline" keySplines="0.25 0.1 0.25 1" keyTimes="0;1" />
                          </rect>
                        </svg>
                        <div className="absolute top-0 pointer-events-none"
                          style={{
                            left: `${domLeftPct}%`,
                            width: `${domWidthPct}%`,
                            height: '100%',
                            borderRadius: '9999px',
                            overflow: 'hidden',
                          }}>
                          <BoxParticles count={18} color="hsl(0, 0%, 95%)" speed={0.4} density={0.45} />
                        </div>
                      </div>
                    );
                  })()}
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
                <div className="w-12 h-px bg-border mx-auto" />
              </>
            )}

            <V3AIPredictionCard wikiEntryId={item.id} artistName={item.title} />
            <div className="w-12 h-px bg-border mx-auto" />

            <V3MissionCards
              wikiEntryId={item.id}
              artistName={item.title}
              videoId={item.latestYoutubeVideoId || null}
              videoTitle={item.latestYoutubeVideoTitle || null}
              channelId={item.youtubeChannelId || null}
              metadata={item.metadata}
            />

            <div className="w-12 h-px bg-border mx-auto" />
            <V3NextScheduleCard wikiEntryId={item.id} artistImage={item.imageUrl} artistName={item.title} />
            <div className="w-12 h-px bg-border mx-auto" />

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
