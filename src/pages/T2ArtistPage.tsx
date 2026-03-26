import { useEffect, useLayoutEffect, useState, useCallback, useMemo } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTrackEvent } from "@/hooks/useTrackEvent";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";

import { ArrowLeft, Calendar, Clock, ExternalLink, Flame, MessageCircle, Share2, ShoppingCart, Star, TrendingUp, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import SEO from "@/components/SEO";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import T2BrandLogo from "@/components/t2/T2BrandLogo";

const GRADE_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  spark: { label: "Spark", icon: Zap, color: "hsl(45 100% 55%)" },
  react: { label: "React", icon: TrendingUp, color: "hsl(200 80% 55%)" },
  spread: { label: "Spread", icon: Share2, color: "hsl(130 60% 45%)" },
  intent: { label: "Intent", icon: ShoppingCart, color: "hsl(30 90% 55%)" },
  commerce: { label: "Commerce", icon: Star, color: "hsl(340 80% 55%)" },
  explosive: { label: "Explosive", icon: Flame, color: "hsl(0 85% 55%)" },
};

const CATEGORY_CONFIG: Record<string, { label: string; labelKo: string; labelJa: string; labelZh: string; color: string }> = {
  brand:   { label: "Brand",   labelKo: "브랜드",  labelJa: "ブランド",    labelZh: "品牌",   color: "hsl(210, 70%, 55%)" },
  product: { label: "Product", labelKo: "제품",    labelJa: "製品",        labelZh: "产品",   color: "hsl(270, 60%, 55%)" },
  place:   { label: "Place",   labelKo: "장소",    labelJa: "場所",        labelZh: "地点",   color: "hsl(145, 55%, 45%)" },
  food:    { label: "Food",    labelKo: "음식",    labelJa: "フード",      labelZh: "美食",   color: "hsl(25, 80%, 55%)" },
  fashion: { label: "Fashion", labelKo: "패션",    labelJa: "ファッション", labelZh: "时尚",   color: "hsl(330, 65%, 55%)" },
  beauty:  { label: "Beauty",  labelKo: "뷰티",    labelJa: "ビューティー", labelZh: "美妆",   color: "hsl(350, 60%, 55%)" },
  media:   { label: "Media",   labelKo: "미디어",  labelJa: "メディア",    labelZh: "媒体",   color: "hsl(190, 70%, 45%)" },
  music:   { label: "Music",   labelKo: "음악",    labelJa: "音楽",        labelZh: "音乐",   color: "hsl(260, 70%, 60%)" },
  event:   { label: "Event",   labelKo: "이벤트",  labelJa: "イベント",    labelZh: "活动",   color: "hsl(45, 85%, 50%)" },
  social:  { label: "Social",  labelKo: "소셜",    labelJa: "ソーシャル",  labelZh: "社交",   color: "hsl(200, 65%, 50%)" },
};

interface BrandRegistryItem {
  id: string;
  brand_name: string;
  brand_name_ko: string | null;
  logo_url: string | null;
  domain: string | null;
  category: string | null;
}

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
  const { language, t } = useLanguage();
  const track = useTrackEvent();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [watchLoading, setWatchLoading] = useState(false);

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [starId]);

  useEffect(() => {
    if (starId) track("t2_artist_view", { artist_slug: starId });
  }, [starId]);

  // Fetch star info
  const { data: star, isLoading: starLoading } = useQuery({
    queryKey: ["t2-artist-star", starId],
    queryFn: async () => {
      const { data } = await supabase
        .from("ktrenz_stars" as any)
        .select("id, wiki_entry_id, group_star_id, display_name, name_ko, agency")
        .eq("id", starId!)
        .maybeSingle();
      if (!data) return null;

      let resolvedWikiEntryId: string | null = (data as any).wiki_entry_id ?? null;
      if (!resolvedWikiEntryId && (data as any).group_star_id) {
        const { data: groupStar } = await supabase
          .from("ktrenz_stars" as any)
          .select("wiki_entry_id")
          .eq("id", (data as any).group_star_id)
          .maybeSingle();
        resolvedWikiEntryId = (groupStar as any)?.wiki_entry_id ?? null;
      }

      // fetch image from wiki_entries
      let imageUrl: string | null = null;
      if (resolvedWikiEntryId) {
        const { data: entry } = await supabase
          .from("wiki_entries")
          .select("image_url")
          .eq("id", resolvedWikiEntryId)
          .maybeSingle();
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

      return { ...(data as any), resolvedWikiEntryId, imageUrl, contentImageUrl };
    },
    enabled: !!starId,
  });

  const keywordTargetStarId = star?.id || starId;

  // Fetch collected keywords for this exact star only (no group keyword fallback)
  const { data: keywords, isLoading: kwLoading } = useQuery({
    queryKey: ["t2-artist-keywords", keywordTargetStarId],
    queryFn: async () => {
      const { data } = await supabase
        .from("ktrenz_trend_triggers" as any)
        .select("*")
        .eq("star_id", keywordTargetStarId!)
        .eq("status", "active")
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

  const relatedBrandIds = useMemo(() => {
    const ids = new Set<string>();
    (keywords ?? []).forEach((kw: any) => {
      if (kw.brand_id && (kw.keyword_category === "brand" || kw.keyword_category === "product")) {
        ids.add(kw.brand_id);
      }
    });
    return Array.from(ids);
  }, [keywords]);

  const { data: relatedBrands = [] } = useQuery({
    queryKey: ["t2-artist-related-brands", relatedBrandIds.join(",")],
    enabled: relatedBrandIds.length > 0,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("ktrenz_brand_registry")
        .select("id, brand_name, brand_name_ko, logo_url, domain, category")
        .in("id", relatedBrandIds);
      return (data ?? []) as BrandRegistryItem[];
    },
  });

  const relatedCommerce = useMemo(() => {
    const brandMap = new Map(relatedBrands.map((brand) => [brand.id, brand]));
    const connectionMap = new Map<string, {
      brand: BrandRegistryItem;
      brandKeywords: any[];
      productKeywords: any[];
      score: number;
    }>();

    (keywords ?? []).forEach((kw: any) => {
      if (!kw.brand_id || (kw.keyword_category !== "brand" && kw.keyword_category !== "product")) return;
      const brand = brandMap.get(kw.brand_id);
      if (!brand) return;

      if (!connectionMap.has(brand.id)) {
        connectionMap.set(brand.id, {
          brand,
          brandKeywords: [],
          productKeywords: [],
          score: 0,
        });
      }

      const connection = connectionMap.get(brand.id)!;
      if (kw.keyword_category === "brand") connection.brandKeywords.push(kw);
      if (kw.keyword_category === "product") connection.productKeywords.push(kw);
      connection.score += Math.max(Number(kw.influence_index) || 0, 0) + ((Number(kw.baseline_score) || 0) * 0.25);
    });

    return Array.from(connectionMap.values()).sort((a, b) => b.score - a.score);
  }, [keywords, relatedBrands]);

  const standaloneProducts = useMemo(() => {
    return (keywords ?? [])
      .filter((kw: any) => kw.keyword_category === "product" && !kw.brand_id)
      .sort((a: any, b: any) => (Number(b.influence_index) || 0) - (Number(a.influence_index) || 0))
      .slice(0, 8);
  }, [keywords]);

  // Fetch AI-predicted schedules using star_id from ktrenz_schedule_predictions
  const { data: scheduleData, isLoading: schedLoading } = useQuery({
    queryKey: ["t2-artist-schedules", starId],
    queryFn: async () => {
      const now = new Date().toISOString();
      const today = now.split("T")[0];

      const { data: predictions } = await supabase
        .from("ktrenz_schedule_predictions" as any)
        .select("*")
        .eq("star_id", starId!)
        .eq("status", "active")
        .gte("expires_at", now)
        .gte("confidence", 0.7)
        .order("confidence", { ascending: false })
        .limit(20) as { data: any[] | null };

      const all = (predictions ?? []) as any[];
      // Map prediction fields to match the expected schedule shape
      const mapped = all.map((p: any) => ({
        ...p,
        title: p.event_title,
        event_date: p.event_date || today,
      }));

      const upcoming = mapped.filter((s: any) => s.event_date >= today)
        .sort((a: any, b: any) => a.event_date.localeCompare(b.event_date));
      const past = mapped.filter((s: any) => s.event_date < today)
        .sort((a: any, b: any) => b.event_date.localeCompare(a.event_date))
        .slice(0, 3);

      return { upcoming, past };
    },
    enabled: !!starId,
  });

  // Fetch artist grade
  const { data: artistGrade } = useQuery({
    queryKey: ["t2-artist-grade", starId],
    queryFn: async () => {
      const { data } = await supabase
        .from("ktrenz_trend_artist_grades" as any)
        .select("grade, grade_score, influence_score, keyword_count, grade_breakdown")
        .eq("star_id", starId!)
        .maybeSingle();
      return data as any;
    },
    enabled: !!starId,
  });


  const { data: isWatched } = useQuery({
    queryKey: ["t2-watched-check", user?.id, starId],
    queryFn: async () => {
      if (!user?.id || !starId) return false;
      const { data } = await supabase
        .from("ktrenz_watched_artists")
        .select("id")
        .eq("user_id", user.id)
        .eq("star_id", starId)
        .maybeSingle();
      return !!data;
    },
    enabled: !!user?.id && !!starId,
  });

  const syncWatchedArtistCaches = useCallback((nextIsWatched: boolean) => {
    if (!user?.id || !starId) return;

    const optimisticStarIds = [starId, ...(star?.group_star_id ? [star.group_star_id] : [])].filter(Boolean) as string[];

    queryClient.setQueryData(["t2-watched-check", user.id, starId], nextIsWatched);
    queryClient.setQueryData(["t2-watched-artists-v2", user.id], (prev: { starIds?: string[] } | undefined) => {
      const current = new Set(prev?.starIds ?? []);

      optimisticStarIds.forEach((id) => {
        if (nextIsWatched) current.add(id);
        else current.delete(id);
      });

      queryClient.setQueryData(["hero-has-watched", user.id], current.size > 0);
      return { starIds: Array.from(current) };
    });
  }, [queryClient, star?.group_star_id, starId, user?.id]);

  const toggleWatch = useCallback(async () => {
    if (!user?.id || !star) return;
    setWatchLoading(true);
    try {
      if (isWatched) {
        const { error } = await supabase
          .from("ktrenz_watched_artists")
          .delete()
          .eq("user_id", user.id)
          .eq("star_id", starId);
        if (error) throw error;

        syncWatchedArtistCaches(false);
        toast.success(language === "ko" ? "관심 해제됨" : "Unfollowed");
      } else {
        const { error } = await supabase
          .from("ktrenz_watched_artists")
          .insert({
            user_id: user.id,
            artist_name: star.display_name,
            star_id: starId,
            wiki_entry_id: star.resolvedWikiEntryId || null,
          });
        if (error) throw error;

        syncWatchedArtistCaches(true);
        toast.success(language === "ko" ? "관심 아티스트 등록!" : "Now watching!");
      }

      queryClient.invalidateQueries({ queryKey: ["t2-watched-check", user.id, starId] });
      queryClient.invalidateQueries({ queryKey: ["t2-watched-artists-v2", user.id] });
      queryClient.invalidateQueries({ queryKey: ["hero-has-watched", user.id] });
      queryClient.invalidateQueries({ queryKey: ["t2-trend-triggers"] });
    } catch (error: any) {
      toast.error(error?.message || "Error");
    } finally {
      setWatchLoading(false);
    }
  }, [user?.id, star, isWatched, language, queryClient, starId, syncWatchedArtistCaches]);

  const displayName = language === "ko" && star?.name_ko ? star.name_ko : star?.display_name ?? "";
  const getKeywordLabel = useCallback((kw: any) => {
    switch (language) {
      case "ko": return kw.keyword_ko || kw.keyword;
      case "ja": return kw.keyword_ja || kw.keyword;
      case "zh": return kw.keyword_zh || kw.keyword;
      default: return kw.keyword;
    }
  }, [language]);
  const getBrandLabel = useCallback((brand: BrandRegistryItem) => {
    return language === "ko" && brand.brand_name_ko ? brand.brand_name_ko : brand.brand_name;
  }, [language]);

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
                {keywords?.length ?? 0} {t("artist.activeKeywords")}
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
                {isWatched ? t("artist.watching") : t("artist.watch")}
             </button>
           )}
         </div>
      ) : null}

      {/* Trend Grade Card */}
      {artistGrade && (
        <section className="mb-6">
          {(() => {
            const gc = GRADE_CONFIG[artistGrade.grade] || GRADE_CONFIG.spark;
            const GradeIcon = gc.icon;
            return (
              <div className="rounded-xl border border-border bg-card p-4">
                {/* Header row */}
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("artist.trendGrade")}
                  </p>
                  {artistGrade.influence_score > 0 && (
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {t("artist.influenceScore")}
                    </p>
                  )}
                </div>

                {/* Grade + Score */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-muted">
                      <GradeIcon className="w-4.5 h-4.5 text-foreground" />
                    </div>
                    <span className="text-lg font-black text-foreground">
                      {gc.label}
                    </span>
                  </div>
                  {artistGrade.influence_score > 0 && (
                    <span className="text-2xl font-black text-foreground tabular-nums">
                      {artistGrade.influence_score.toFixed(2)}
                    </span>
                  )}
                </div>

                {/* Grade breakdown */}
                {artistGrade.grade_breakdown && Object.keys(artistGrade.grade_breakdown).length > 0 && (
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1.5">{t("artist.gradeBreakdownDesc")}</p>
                    <div className="space-y-1.5">
                      {Object.entries(artistGrade.grade_breakdown).map(([grade, count]) => {
                        const g = GRADE_CONFIG[grade];
                        const hintKey = `artist.gradeHint.${grade}` as any;
                        return (
                          <div key={grade} className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
                            <span className="text-xs font-bold text-foreground shrink-0">
                              {g?.label || grade}: {count as number}
                            </span>
                            <span className="text-[10px] text-muted-foreground truncate">
                              {t(hintKey)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </section>
      )}

      {(relatedCommerce.length > 0 || standaloneProducts.length > 0) && (
        <section className="mb-8">
          <h2 className="text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5 text-secondary-foreground">
            <ShoppingCart className="w-4 h-4" />
            {language === "ko" ? "연관 브랜드 & 제품" : language === "ja" ? "関連ブランド＆製品" : language === "zh" ? "相关品牌与产品" : "Related Brands & Products"}
          </h2>

          <div className="space-y-3">
            {relatedCommerce.map((connection) => (
              <div key={connection.brand.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl border border-border/60 bg-muted/40 overflow-hidden flex items-center justify-center shrink-0">
                    <T2BrandLogo
                      brandId={connection.brand.id}
                      brandName={connection.brand.brand_name}
                      domain={connection.brand.domain}
                      logoUrl={connection.brand.logo_url}
                      alt={connection.brand.brand_name}
                      className="w-full h-full object-contain"
                      fallbackClassName="text-sm"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <button onClick={() => navigate(`/t2/brand/${connection.brand.id}`)} className="text-sm font-black text-foreground truncate hover:text-primary transition-colors cursor-pointer">{getBrandLabel(connection.brand)}</button>
                    <p className="text-[11px] text-muted-foreground">
                      {connection.productKeywords.length} {language === "ko" ? "products" : "products"}
                      {connection.brandKeywords.length > 0 ? ` · ${connection.brandKeywords.length} ${language === "ko" ? "brand mentions" : "brand mentions"}` : ""}
                    </p>
                  </div>
                </div>

                {connection.productKeywords.length > 0 && (
                  <div className="mb-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Products</p>
                    <div className="flex flex-wrap gap-2">
                      {connection.productKeywords.slice(0, 8).map((kw: any) => (
                        <button
                          key={kw.id}
                          onClick={() => navigate(`/t2/${kw.id}`)}
                          className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-foreground hover:border-primary/40 hover:text-primary transition-colors"
                        >
                          {getKeywordLabel(kw)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {connection.brandKeywords.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Brand Keywords</p>
                    <div className="flex flex-wrap gap-2">
                      {connection.brandKeywords.slice(0, 6).map((kw: any) => (
                        <button
                          key={kw.id}
                          onClick={() => navigate(`/t2/${kw.id}`)}
                          className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {getKeywordLabel(kw)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {standaloneProducts.length > 0 && (
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Products</p>
                <div className="flex flex-wrap gap-2">
                  {standaloneProducts.map((kw: any) => (
                    <button
                      key={kw.id}
                      onClick={() => navigate(`/t2/${kw.id}`)}
                      className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-foreground hover:border-primary/40 hover:text-primary transition-colors"
                    >
                      {getKeywordLabel(kw)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Keywords section */}
      <section className="mb-8">
        <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <MessageCircle className="w-4 h-4 -scale-x-100" />
          {t("artist.trendKeywords")}
        </h2>

        {kwLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : keywords && keywords.length > 0 ? (
          <div className="space-y-3">
            {keywords.map((kw: any, idx: number) => {
              const catConfig = CATEGORY_CONFIG[kw.keyword_category];
              const kwText = (() => {
                switch (language) {
                  case "ko": return kw.keyword_ko || kw.keyword;
                  case "ja": return kw.keyword_ja || kw.keyword;
                  case "zh": return kw.keyword_zh || kw.keyword;
                  default: return kw.keyword;
                }
              })();
              const ctxText = (() => {
                switch (language) {
                  case "ko": return kw.context_ko || kw.context;
                  case "ja": return kw.context_ja || kw.context;
                  case "zh": return kw.context_zh || kw.context;
                  default: return kw.context;
                }
              })();

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
                          {(() => {
                            switch (language) {
                              case "ko": return catConfig?.labelKo || kw.keyword_category;
                              case "ja": return catConfig?.labelJa || kw.keyword_category;
                              case "zh": return catConfig?.labelZh || kw.keyword_category;
                              default: return catConfig?.label || kw.keyword_category;
                            }
                          })()}
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
                        const nowMs = Date.now();
                        const spanMs = Math.max(nowMs - startMs, 3600000);
                        const maxVal = Math.max(...pts.map(p => p.v), 1);

                        const W = 100;
                        const H = 18;
                        const toX = (t: number) => Math.min(((t - startMs) / spanMs) * W, W);
                        const toY = (v: number) => H - (v / maxVal) * (H - 2);

                        // Extend last point to current time
                        const lastPt = pts[pts.length - 1];
                        const extendedPts = [...pts];
                        if (lastPt.t < nowMs) {
                          extendedPts.push({ t: nowMs, v: lastPt.v });
                        }

                        const path = extendedPts.map((p, i) =>
                          `${i === 0 ? "M" : "L"}${toX(p.t).toFixed(1)},${toY(p.v).toFixed(1)}`
                        ).join(" ");
                        const fill = path + ` L${W},${H} L0,${H} Z`;

                        // Time labels: 5 labels for 4 segments
                        const fmtH = (h: number) => h >= 24 ? `${Math.round(h / 24)}d` : `${Math.round(h)}h`;
                        const totalH = Math.round(spanMs / 3600000);
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
                              <span>{fmtH(Math.round(totalH * 0.25))}</span>
                              <span>{fmtH(Math.round(totalH * 0.5))}</span>
                              <span>{fmtH(Math.round(totalH * 0.75))}</span>
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
        <div className="flex items-center mb-3">
          <h2 className="text-sm font-bold uppercase tracking-wider flex items-center gap-1.5 text-secondary-foreground">
            <Calendar className="w-4 h-4" />
            {language === "ko" ? "예측 일정" : "Predicted Schedule"}
          </h2>
        </div>

        {schedLoading ? (
          <div className="space-y-2">
            {[1, 2].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
          </div>
        ) : (
          <>
            {(scheduleData?.upcoming?.length ?? 0) > 0 && (
              <div className="space-y-2 mb-4">
                {scheduleData!.upcoming.map((sch: any, idx: number) => {
                  const catEmojis: Record<string, string> = {
                    release: "💿", broadcast: "📡", event: "✨", travel: "✈️",
                    concert: "🎤", fanmeeting: "💕", award: "🏆", variety: "📺",
                  };
                  const catLabels: Record<string, string> = {
                    release: language === "ko" ? "발    매" : "Release",
                    broadcast: language === "ko" ? "방송" : "Broadcast",
                    event: language === "ko" ? "이벤트" : "Event",
                    travel: language === "ko" ? "여행" : "Travel",
                    concert: language === "ko" ? "콘서트" : "Concert",
                    fanmeeting: language === "ko" ? "팬미팅" : "Fan Meeting",
                    award: language === "ko" ? "시상식" : "Award",
                    variety: language === "ko" ? "예능" : "Variety",
                  };
                  const emoji = catEmojis[sch.category] || "📅";
                  const label = catLabels[sch.category] || sch.category;
                  const daysAway = Math.ceil((new Date(sch.event_date).getTime() - Date.now()) / 86400000);
                  const isToday = daysAway === 0;
                  const isSoon = daysAway >= 1 && daysAway <= 3;
                  const confidence = sch.confidence ? Math.round(sch.confidence * 100) : null;

                  return (
                    <div
                      key={sch.id}
                      className={cn(
                        "relative overflow-hidden rounded-xl border p-3 transition-all",
                        "bg-muted/40 border-border/30",
                        isToday && "border-primary/40 shadow-[0_0_12px_hsl(var(--primary)/0.1)]"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        {/* Date block */}
                        <div className={cn(
                          "shrink-0 w-12 h-12 rounded-lg flex flex-col items-center justify-center",
                          isToday ? "bg-primary text-primary-foreground" :
                          isSoon ? "bg-accent text-accent-foreground" :
                          "bg-muted text-muted-foreground"
                        )}>
                          <span className="text-[10px] font-medium leading-none">
                            {new Date(sch.event_date).toLocaleDateString(language === "ko" ? "ko" : "en", { month: "short" })}
                          </span>
                          <span className="text-lg font-black leading-tight">
                            {new Date(sch.event_date).getDate()}
                          </span>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-foreground line-clamp-2 leading-snug">
                            {sch.title}
                          </p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground">
                              {emoji} {label}
                            </span>
                            {confidence && (
                              <span className={cn(
                                "text-[10px] font-semibold",
                                confidence >= 90 ? "text-emerald-500" :
                                confidence >= 80 ? "text-blue-500" : "text-amber-500"
                              )}>
                                {confidence}%
                              </span>
                            )}
                          </div>
                          {sch.reasoning && (
                            <p className="text-[10px] text-muted-foreground mt-1 line-clamp-1 italic">
                              {sch.reasoning}
                            </p>
                          )}
                        </div>

                        {/* D-day badge */}
                        <div className={cn(
                          "shrink-0 text-xs font-extrabold px-2 py-1 rounded-lg",
                          isToday ? "bg-primary text-primary-foreground" :
                          isSoon ? "bg-accent text-accent-foreground" :
                          "bg-muted/60 text-muted-foreground"
                        )}>
                          {isToday ? "TODAY" : daysAway < 0 ? `D+${Math.abs(daysAway)}` : `D-${daysAway}`}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Past */}
            {(scheduleData?.past?.length ?? 0) > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  {language === "ko" ? "지난 예측" : "Past Predictions"}
                </p>
                {scheduleData!.past.map((sch: any) => (
                  <div key={sch.id} className="flex items-center gap-2.5 rounded-lg border border-border/30 bg-muted/20 p-2.5 opacity-60">
                    <span className="text-[10px] font-bold text-muted-foreground shrink-0 w-10 text-center">
                      {formatEventDate(sch.event_date, language)}
                    </span>
                    <p className="text-xs text-muted-foreground truncate flex-1">{sch.title}</p>
                  </div>
                ))}
              </div>
            )}

            {(scheduleData?.upcoming?.length ?? 0) === 0 && (scheduleData?.past?.length ?? 0) === 0 && (
              <div className="text-center py-6 rounded-xl border border-dashed border-border/40">
                <Calendar className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  {language === "ko" ? "예측된 일정이 없습니다" : "No predicted events"}
                </p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                  {language === "ko" ? "뉴스 데이터가 수집되면 자동으로 표시됩니다" : "Will appear when news data is collected"}
                </p>
              </div>
            )}
          </>
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
