import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTrackEvent } from "@/hooks/useTrackEvent";

import { ArrowLeft, Calendar, Clock, ExternalLink, MessageCircle, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import SEO from "@/components/SEO";
import { Skeleton } from "@/components/ui/skeleton";

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

  useEffect(() => {
    document.documentElement.classList.add("v3-theme");
    if (starId) track("t2_artist_view", { artist_slug: starId });
    return () => { document.documentElement.classList.remove("v3-theme"); };
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
      if (!imageUrl) {
        const { data: kwData } = await supabase
          .from("ktrenz_trend_triggers" as any)
          .select("source_image_url")
          .eq("star_id", starId!)
          .not("source_image_url", "is", null)
          .limit(1);
        if (kwData && kwData.length > 0) {
          imageUrl = (kwData[0] as any).source_image_url;
        }
      }

      return { ...(data as any), imageUrl };
    },
    enabled: !!starId,
  });

  // Fetch keywords for this artist
  const { data: keywords, isLoading: kwLoading } = useQuery({
    queryKey: ["t2-artist-keywords", starId],
    queryFn: async () => {
      const { data } = await supabase
        .from("ktrenz_trend_triggers" as any)
        .select("*")
        .eq("star_id", starId!)
        .eq("status", "active")
        .neq("trigger_source", "naver_shop")
        .order("influence_index", { ascending: false })
        .order("baseline_score", { ascending: false })
        .order("detected_at", { ascending: false })
        .limit(50);
      return (data ?? []) as any[];
    },
    enabled: !!starId,
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
            <img
              src={star.imageUrl}
              alt={displayName}
              className="w-16 h-16 lg:w-20 lg:h-20 rounded-full object-cover border-2 border-primary/20"
            />
          ) : (
            <div className="w-16 h-16 lg:w-20 lg:h-20 rounded-full bg-muted flex items-center justify-center text-2xl font-black text-muted-foreground">
              {displayName.charAt(0)}
            </div>
          )}
          <div>
            <h1 className="text-xl lg:text-2xl font-black text-foreground">{displayName}</h1>
            {star.agency && (
              <p className="text-sm text-muted-foreground">{star.agency}</p>
            )}
            <p className="text-xs text-primary font-bold mt-0.5">
              {keywords?.length ?? 0} {language === "ko" ? "활성 키워드" : "active keywords"}
            </p>
          </div>
        </div>
      ) : null}

      {/* Keywords section */}
      <section className="mb-8">
        <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <MessageCircle className="w-4 h-4" />
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

                      {/* Lifetime timeline bar */}
                      {(() => {
                        const detectedMs = new Date(kw.detected_at).getTime();
                        const nowMs = Date.now();
                        const elapsedHours = (nowMs - detectedMs) / 3600000;
                        const isExpired = !!kw.expired_at;
                        // Use actual lifetime if expired, otherwise estimate from elapsed time
                        const totalHours = isExpired && kw.lifetime_hours
                          ? kw.lifetime_hours
                          : Math.max(elapsedHours * 1.2, 48); // dynamic scale: 120% of elapsed or min 48h
                        const progressPct = isExpired ? 100 : Math.min((elapsedHours / totalHours) * 100, 95);
                        const peakPct = kw.peak_delay_hours != null
                          ? Math.min((kw.peak_delay_hours / totalHours) * 100, 100)
                          : null;

                        const displayHours = isExpired ? Math.round(kw.lifetime_hours ?? elapsedHours) : Math.round(elapsedHours);
                        const displayLabel = displayHours >= 24
                          ? `${Math.round(displayHours / 24)}d`
                          : `${displayHours}h`;

                        return (
                          <div className="mt-2.5">
                            <div className="flex items-center justify-between text-[9px] text-muted-foreground mb-1">
                              <span>{language === "ko" ? "라이프사이클" : "Lifecycle"}</span>
                              <span>
                                {isExpired
                                  ? `${displayLabel} · ${language === "ko" ? "만료" : "Expired"}`
                                  : `${displayLabel} ${language === "ko" ? "경과" : "elapsed"}`}
                              </span>
                            </div>
                            <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                              <div
                                className={cn(
                                  "absolute inset-y-0 left-0 rounded-full transition-all",
                                  isExpired ? "bg-muted-foreground/40" : "bg-primary/60"
                                )}
                                style={{ width: `${progressPct}%` }}
                              />
                              {peakPct != null && (
                                <div
                                  className="absolute top-0 bottom-0 w-0.5 bg-primary rounded-full"
                                  style={{ left: `${peakPct}%` }}
                                  title={`Peak at ${Math.round(kw.peak_delay_hours)}h`}
                                >
                                  <div className="absolute -top-1.5 left-1/2 -translate-x-1/2">
                                    <TrendingUp className="w-2.5 h-2.5 text-primary" />
                                  </div>
                                </div>
                              )}
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
