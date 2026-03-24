import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTrackEvent } from "@/hooks/useTrackEvent";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";

import { ArrowLeft, Calendar, Clock, ExternalLink, MessageCircle, Star, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import SEO from "@/components/SEO";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

const CATEGORY_CONFIG: Record<string, { label: string; labelKo: string; color: string }> = {
  brand:   { label: "Brand",   labelKo: "브랜드",  color: "hsl(210, 70%, 55%)" },
  product: { label: "Product", labelKo: "제품",    color: "hsl(270, 60%, 55%)" },
  place:   { label: "Place",   labelKo: "장소",    color: "hsl(145, 55%, 45%)" },
  food:    { label: "Food",    labelKo: "음식",    color: "hsl(25, 80%, 55%)" },
  fashion: { label: "Fashion", labelKo: "패션",    color: "hsl(330, 65%, 55%)" },
  beauty:  { label: "Beauty",  labelKo: "뷰티",    color: "hsl(350, 60%, 55%)" },
  media:   { label: "Media",   labelKo: "미디어",  color: "hsl(190, 70%, 45%)" },
  music:   { label: "Music",   labelKo: "음악",    color: "hsl(260, 70%, 60%)" },
  event:   { label: "Event",   labelKo: "이벤트",  color: "hsl(45, 85%, 50%)" },
};

function formatAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatEventDate(dateStr: string, lang: string): string {
  const d = new Date(dateStr);
  if (lang === "ko") {
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const T2ArtistPage = () => {
  const { starId } = useParams<{ starId: string }>();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const track = useTrackEvent();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [watchLoading, setWatchLoading] = useState(false);

  useEffect(() => {
    if (starId) track("t2_artist_view", { artist_slug: starId });
  }, [starId]);

  // Fetch star info
  const { data: star, isLoading: starLoading } = useQuery({
    queryKey: ["t2-artist-star", starId],
    queryFn: async () => {
      const { data } = await supabase
        .from("ktrenz_stars" as any)
        .select("id, wiki_entry_id, display_name, name_ko, agency")
        .eq("id", starId!)
        .single();
      if (!data) return null;

      // fetch image from wiki_entries
      let imageUrl: string | null = null;
      if ((data as any).wiki_entry_id) {
        const { data: entry } = await supabase
          .from("wiki_entries")
          .select("image_url")
          .eq("id", (data as any).wiki_entry_id)
          .single();
        imageUrl = (entry as any)?.image_url ?? null;
      }

      // fallback: use first keyword's source_image_url
      let contentImageUrl: string | null = null;
      const { data: kwData } = await supabase
        .from("ktrenz_trend_triggers" as any)
        .select("source_image_url")
        .eq("star_id", starId!)
        .not("source_image_url", "is", null)
        .order("detected_at", { ascending: false })
        .limit(1);
      if (kwData && kwData.length > 0) {
        contentImageUrl = (kwData[0] as any).source_image_url;
      }

      if (!imageUrl) {
        imageUrl = contentImageUrl;
      }

      return { ...(data as any), imageUrl, contentImageUrl };
    },
    enabled: !!starId,
  });

  const keywordTargetStarId = star?.group_star_id || star?.id || starId;

  // Fetch keywords for this artist (fallback to group artist for members)
  const { data: keywords, isLoading: kwLoading } = useQuery({
    queryKey: ["t2-artist-keywords", keywordTargetStarId],
    queryFn: async () => {
      const { data } = await supabase
        .from("ktrenz_trend_triggers" as any)
        .select("*")
        .eq("star_id", keywordTargetStarId!)
        .eq("status", "active")
        .neq("trigger_source", "naver_shop")
        .order("influence_index", { ascending: false })
        .order("baseline_score", { ascending: false })
        .order("detected_at", { ascending: false })
        .limit(50);
      return (data ?? []) as any[];
    },
    enabled: !!keywordTargetStarId,
  });

  // Fetch tracking history for all keywords in batch
  const kwIds = useMemo(() => (keywords ?? []).map((k: any) => k.id).join(","), [keywords]);
  const { data: trackingMap } = useQuery({
    queryKey: ["t2-artist-tracking", starId, kwIds],
    queryFn: async () => {
      if (!keywords || keywords.length === 0) return new Map<string, any[]>();
      const ids = keywords.map((k: any) => k.id);
      const allData: any[] = [];
      for (let i = 0; i < ids.length; i += 20) {
        const batch = ids.slice(i, i + 20);
        const { data } = await supabase
          .from("ktrenz_trend_tracking" as any)
          .select("trigger_id, tracked_at, interest_score")
          .in("trigger_id", batch)
          .order("tracked_at", { ascending: true })
          .limit(500);
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
    enabled: !!keywords && keywords.length > 0,
  });

  // Fetch schedules
  const { data: schedules, isLoading: schedLoading } = useQuery({
    queryKey: ["t2-artist-schedules", star?.wiki_entry_id],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const { data } = await supabase
        .from("ktrenz_schedules" as any)
        .select("*")
        .eq("wiki_entry_id", star!.wiki_entry_id)
        .gte("event_date", today)
        .order("event_date", { ascending: true })
        .limit(20);
      return (data ?? []) as any[];
    },
    enabled: !!star?.wiki_entry_id,
  });

  // Watch status
  const { data: isWatched } = useQuery({
    queryKey: ["t2-watched-check", user?.id, star?.wiki_entry_id],
    queryFn: async () => {
      if (!user?.id || !star?.wiki_entry_id) return false;
      const { data } = await supabase
        .from("ktrenz_watched_artists")
        .select("id")
        .eq("user_id", user.id)
        .eq("wiki_entry_id", star.wiki_entry_id)
        .maybeSingle();
      return !!data;
    },
    enabled: !!user?.id && !!star?.wiki_entry_id,
  });

  const toggleWatch = useCallback(async () => {
    if (!user?.id || !star) return;
    if (!star.wiki_entry_id) {
      toast.error(language === "ko" ? "이 아티스트는 아직 연동되지 않았습니다" : "This artist is not linked yet");
      return;
    }
    setWatchLoading(true);
    try {
      if (isWatched) {
        await supabase
          .from("ktrenz_watched_artists")
          .delete()
          .eq("user_id", user.id)
          .eq("wiki_entry_id", star.wiki_entry_id);
        toast.success(language === "ko" ? "관심 해제됨" : "Unfollowed");
      } else {
        // Delete existing then insert to avoid duplicates
        await supabase
          .from("ktrenz_watched_artists")
          .delete()
          .eq("user_id", user.id);
        await supabase
          .from("ktrenz_watched_artists")
          .insert({
            user_id: user.id,
            artist_name: star.display_name,
            wiki_entry_id: star.wiki_entry_id,
          });
        toast.success(language === "ko" ? "관심 아티스트 등록!" : "Now watching!");
      }
      queryClient.invalidateQueries({ queryKey: ["t2-watched-check"] });
      queryClient.invalidateQueries({ queryKey: ["t2-watched-artists"] });
    } catch {
      toast.error("Error");
    } finally {
      setWatchLoading(false);
    }
  }, [user?.id, star, isWatched, language]);

  const displayName = language === "ko" && star?.name_ko ? star.name_ko : star?.display_name ?? "";

  const subHeader = (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50 pt-[env(safe-area-inset-top)]">
      <div className="flex items-center h-14 px-4 max-w-screen-lg mx-auto">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="ml-3 text-base font-bold text-foreground truncate">{displayName}</span>
      </div>
    </header>
  );

  const content = (
    <div className="max-w-2xl mx-auto px-4 pb-10 pt-4">
      {/* Artist profile header */}
      {starLoading ? (
        <div className="flex items-center gap-4 mb-6">
          <Skeleton className="w-16 h-16 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="w-32 h-6" />
            <Skeleton className="w-20 h-4" />
          </div>
        </div>
      ) : star ? (
         <div className="flex items-center gap-4 mb-6">
           {star.imageUrl ? (
             <>
                <img
                  src={star.imageUrl}
                  alt={displayName}
                  className="w-16 h-16 lg:w-20 lg:h-20 rounded-full object-cover border-2 border-primary/20 shrink-0"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const el = e.currentTarget;
                    if (star.contentImageUrl && el.src !== star.contentImageUrl) {
                      el.src = star.contentImageUrl;
                      return;
                    }
                    el.style.display = "none";
                    const fallback = el.nextElementSibling as HTMLElement;
                    if (fallback) fallback.style.display = "flex";
                  }}
                />
                <div className="w-16 h-16 lg:w-20 lg:h-20 rounded-full bg-muted items-center justify-center text-2xl font-black text-muted-foreground shrink-0" style={{ display: "none" }}>
                  {displayName.charAt(0)}
                </div>
             </>
           ) : (
             <div className="w-16 h-16 lg:w-20 lg:h-20 rounded-full bg-muted flex items-center justify-center text-2xl font-black text-muted-foreground shrink-0">
               {displayName.charAt(0)}
             </div>
           )}
           <div className="flex-1 min-w-0">
             <h1 className="text-xl lg:text-2xl font-black text-foreground">{displayName}</h1>
             {star.agency && (
               <p className="text-sm text-muted-foreground">{star.agency}</p>
             )}
             <p className="text-xs text-primary font-bold mt-0.5">
               {keywords?.length ?? 0} {language === "ko" ? "활성 키워드" : "active keywords"}
             </p>
           </div>
           {user && (
             <button
               onClick={toggleWatch}
               disabled={watchLoading}
               className={cn(
                 "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all",
                 isWatched
                   ? "bg-amber-500/15 text-amber-500 border border-amber-500/30"
                   : "bg-muted text-muted-foreground border border-border hover:border-amber-500/50 hover:text-amber-500"
               )}
             >
               <Star className={cn("w-3.5 h-3.5", isWatched && "fill-amber-500")} />
               {isWatched
                 ? (language === "ko" ? "관심중" : "Watching")
                 : (language === "ko" ? "관심 등록" : "Watch")}
             </button>
           )}
         </div>
      ) : null}

      {/* Keywords section */}
      <section className="mb-8">
        <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <MessageCircle className="w-4 h-4 -scale-x-100" />
          {language === "ko" ? "트렌드 키워드" : "Trend Keywords"}
        </h2>

        {kwLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : keywords && keywords.length > 0 ? (
          <div className="space-y-3">
            {keywords.map((kw: any, idx: number) => {
              const catConfig = CATEGORY_CONFIG[kw.keyword_category];
              const kwText = language === "ko" && kw.keyword_ko ? kw.keyword_ko : kw.keyword;
              const ctxText = language === "ko" && kw.context_ko ? kw.context_ko : kw.context;

              return (
                <button
                  key={kw.id}
                  onClick={() => navigate(`/t2/${kw.id}`)}
                  className="w-full text-left rounded-xl border border-border hover:border-primary/30 bg-card p-3.5 transition-all group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded-sm text-white shrink-0"
                          style={{ background: catConfig?.color || "hsl(var(--muted-foreground))" }}
                        >
                          {language === "ko" ? catConfig?.labelKo || kw.keyword_category : catConfig?.label || kw.keyword_category}
                        </span>
                        <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          {formatAge(kw.detected_at)}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-foreground truncate group-hover:text-primary transition-colors">
                        {kwText}
                      </h3>
                      {ctxText && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{ctxText}</p>
                      )}

                      {/* Sparkline – real tracking data */}
                      {(() => {
                        const history = trackingMap?.get(kw.id) ?? [];
                        const isExpired = !!kw.expired_at;

                        // Build points: use real tracking history if available
                        let pts: { t: number; v: number }[] = [];
                        if (history.length >= 2) {
                          pts = history.map((h: any) => ({
                            t: new Date(h.tracked_at).getTime(),
                            v: h.interest_score ?? 0,
                          }));
                        } else if (history.length === 1) {
                          // 1 point: show baseline → single point
                          const h = history[0];
                          pts = [
                            { t: new Date(kw.detected_at).getTime(), v: kw.baseline_score ?? 0 },
                            { t: new Date(h.tracked_at).getTime(), v: h.interest_score ?? 0 },
                          ];
                        } else {
                          // No tracking yet: show flat line at baseline
                          const detMs = new Date(kw.detected_at).getTime();
                          const bv = kw.baseline_score ?? 0;
                          pts = [
                            { t: detMs, v: bv },
                            { t: Date.now(), v: bv },
                          ];
                        }

                        if (pts.length < 2) return null;

                        const startMs = pts[0].t;
                        const endMs = pts[pts.length - 1].t;
                        const spanMs = Math.max(endMs - startMs, 3600000);
                        const maxVal = Math.max(...pts.map(p => p.v), 1);

                        const W = 100;
                        const H = 18;
                        const toX = (t: number) => ((t - startMs) / spanMs) * W;
                        const toY = (v: number) => H - (v / maxVal) * (H - 2);

                        const path = pts.map((p, i) =>
                          `${i === 0 ? "M" : "L"}${toX(p.t).toFixed(1)},${toY(p.v).toFixed(1)}`
                        ).join(" ");
                        const fill = path + ` L${toX(pts[pts.length - 1].t).toFixed(1)},${H} L0,${H} Z`;

                        // Time labels
                        const fmtH = (h: number) => h >= 24 ? `${Math.round(h / 24)}d` : `${Math.round(h)}h`;
                        const totalH = Math.round(spanMs / 3600000);
                        const t1 = fmtH(Math.round(totalH * 0.33));
                        const t2 = fmtH(Math.round(totalH * 0.66));
                        const startLabel = fmtH(0);
                        const endLabel = isExpired ? (language === "ko" ? "만료" : "expired") : (language === "ko" ? "현재" : "now");

                        return (
                          <div className="mt-1.5">
                            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[18px]" preserveAspectRatio="none">
                              <path d={fill} fill={isExpired ? "hsl(var(--muted-foreground) / 0.08)" : "hsl(var(--primary) / 0.12)"} />
                              <path d={path} fill="none" stroke={isExpired ? "hsl(var(--muted-foreground) / 0.35)" : "hsl(var(--primary) / 0.6)"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <div className="flex justify-between text-[8px] text-muted-foreground mt-0.5">
                              <span>{startLabel}</span>
                              <span>{t1}</span>
                              <span>{t2}</span>
                              <span>{endLabel}</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1 pt-0.5">
                      {kw.influence_index > 0 && (
                        <span className="text-sm font-black text-primary">
                          +{Number(kw.influence_index).toFixed(0)}%
                        </span>
                      )}
                      {kw.source_image_url && (
                        <img
                          src={kw.source_image_url}
                          alt=""
                          className="w-14 h-14 rounded-lg object-cover mt-1"
                        />
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic py-4">
            {language === "ko" ? "현재 활성 키워드 없음" : "No active keywords"}
          </p>
        )}
      </section>

      {/* Schedule section */}
      <section>
        <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Calendar className="w-4 h-4" />
          {language === "ko" ? "다가오는 일정" : "Upcoming Schedule"}
        </h2>

        {schedLoading ? (
          <div className="space-y-2">
            {[1, 2].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}
          </div>
        ) : schedules && schedules.length > 0 ? (
          <div className="space-y-2">
            {schedules.map((sch: any) => (
              <div
                key={sch.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
              >
                <div className="shrink-0 w-12 text-center">
                  <span className="text-xs font-bold text-primary">
                    {formatEventDate(sch.event_date, language)}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{sch.title}</p>
                  {sch.category && (
                    <span className="text-[10px] text-muted-foreground">{sch.category}</span>
                  )}
                </div>
                {sch.event_time && (
                  <span className="text-[10px] text-muted-foreground shrink-0">{sch.event_time}</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic py-4">
            {language === "ko" ? "예정된 일정 없음" : "No upcoming events"}
          </p>
        )}
      </section>
    </div>
  );

  return (
    <>
      <SEO title={`${displayName} – Kinterest`} description={`${displayName} trend keywords and schedule`} path={`/t2/artist/${starId}`} />
      {subHeader}
      <div className="pt-14 pb-10">{content}</div>
    </>
  );
};

export default T2ArtistPage;
