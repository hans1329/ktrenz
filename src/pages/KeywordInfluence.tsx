import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, TrendingUp, ExternalLink, ChevronRight, Flame, Sparkles, Users, Loader2, ShoppingBag, Tag, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const CATEGORY_LABELS: Record<string, string> = {
  music: "음악", media: "미디어", event: "이벤트", fashion: "패션",
  beauty: "뷰티", food: "음식", brand: "브랜드", product: "제품",
  social: "소셜", restaurant: "맛집", lifestyle: "라이프스타일",
};

const SOURCE_ICON: Record<string, string> = {
  naver_news: "📰", naver_blog: "📝", youtube: "▶️", tiktok: "🎵",
  instagram: "📸", datalab: "📊",
};

const SOURCE_LABEL: Record<string, string> = {
  naver_news: "네이버 뉴스", naver_blog: "네이버 블로그", youtube: "유튜브",
  tiktok: "틱톡", instagram: "인스타그램", datalab: "데이터랩",
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "방금 전";
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

function getMomentum(kw: any) {
  const score = Number(kw.prev_api_total ?? kw.peak_score ?? 0);
  const base = Number(kw.baseline_score ?? 0);
  const delta = score - base;
  if (delta > 50) return { label: "🔥 급상승", color: "text-red-500" };
  if (delta > 20) return { label: "📈 확산 중", color: "text-amber-500" };
  if (delta > 0) return { label: "🌱 형성 중", color: "text-emerald-500" };
  return { label: "✨ 신규", color: "text-primary" };
}

const KeywordInfluence = () => {
  const navigate = useNavigate();
  const [selectedKw, setSelectedKw] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "brand" | "product" | "other">("all");

  // Fetch keywords with source counts
  const { data: keywords, isLoading } = useQuery({
    queryKey: ["ag-keywords"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ktrenz_keywords")
        .select("id, keyword, keyword_ko, keyword_category, influence_index, baseline_score, peak_score, prev_api_total, detected_at, source_url, source_image_url, context_ko")
        .eq("status", "active")
        .order("detected_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch all sources for displayed keywords
  const keywordIds = keywords?.map(k => k.id) ?? [];
  const { data: allSources } = useQuery({
    queryKey: ["ag-sources", keywordIds],
    enabled: keywordIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ktrenz_keyword_sources")
        .select("id, keyword_id, star_id, artist_name, trigger_source, source_url, source_title, source_image_url, context_ko, confidence, commercial_intent, created_at")
        .in("keyword_id", keywordIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch star info for sources
  const starIds = [...new Set((allSources ?? []).map(s => s.star_id).filter(Boolean))];
  const { data: stars } = useQuery({
    queryKey: ["ag-stars", starIds],
    enabled: starIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ktrenz_stars")
        .select("id, display_name, name_ko, star_type, group_star_id, image_url")
        .in("id", starIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const starMap = new Map((stars ?? []).map(s => [s.id, s]));
  const sourcesMap = new Map<string, typeof allSources>();
  (allSources ?? []).forEach(s => {
    const arr = sourcesMap.get(s.keyword_id) ?? [];
    arr.push(s);
    sourcesMap.set(s.keyword_id, arr);
  });

  // Group star names for display
  const getGroupName = (starId: string) => {
    const star = starMap.get(starId);
    if (!star) return null;
    if (star.group_star_id) {
      const group = starMap.get(star.group_star_id);
      return group?.name_ko || group?.display_name || null;
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1">
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-foreground">키워드 영향력</h1>
          <p className="text-xs text-muted-foreground">아티스트 컨텐츠가 시장 트렌드로 확산되는 과정을 추적합니다</p>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-3">
        {/* Category Tabs */}
        <div className="flex gap-2 mb-4">
          {([
            { key: "all" as const, label: "전체", icon: MoreHorizontal },
            { key: "brand" as const, label: "브랜드", icon: Tag },
            { key: "product" as const, label: "상품", icon: ShoppingBag },
            { key: "other" as const, label: "그 외", icon: Sparkles },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
                activeTab === tab.key
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-muted/50"
              )}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {keywords?.filter(kw => {
          if (activeTab === "all") return true;
          const cat = kw.keyword_category;
          if (activeTab === "brand") return cat === "brand";
          if (activeTab === "product") return ["product", "goods"].includes(cat);
          return !["brand", "product", "goods"].includes(cat);
        }).map(kw => {
          const sources = sourcesMap.get(kw.id) ?? [];
          const isOpen = selectedKw === kw.id;
          const m = getMomentum(kw);
          const score = Number(kw.prev_api_total ?? kw.peak_score ?? 0);
          const base = Number(kw.baseline_score ?? 0);
          const delta = score - base;

          // Unique artists for this keyword
          const uniqueArtists = [...new Map(sources.map(s => [s.star_id, s])).values()];

          return (
            <div key={kw.id} className="rounded-2xl border bg-card overflow-hidden border-primary-foreground">
              <button
                onClick={() => setSelectedKw(isOpen ? null : kw.id)}
                className="w-full px-4 py-4 flex items-center gap-3 text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-lg font-black text-foreground">{kw.keyword_ko || kw.keyword}</span>
                    {kw.keyword_ko && kw.keyword !== kw.keyword_ko && (
                      <span className="text-sm text-muted-foreground">{kw.keyword}</span>
                    )}
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {CATEGORY_LABELS[kw.keyword_category] || kw.keyword_category}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className={cn("text-xs font-medium", m.color)}>{m.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {sources.length}개 컨텐츠 · {uniqueArtists.length}명 아티스트
                    </span>
                  </div>
                </div>

                {/* Artist avatar stack */}
                <div className="flex -space-x-2 shrink-0">
                  {uniqueArtists.slice(0, 3).map(s => {
                    const star = starMap.get(s.star_id);
                    return star?.image_url ? (
                      <img
                        key={s.star_id}
                        src={star.image_url}
                        alt={star.name_ko || star.display_name}
                        className="w-8 h-8 rounded-full border-2 border-card object-cover"
                      />
                    ) : (
                      <div key={s.star_id} className="w-8 h-8 rounded-full border-2 border-card bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                        {(star?.name_ko || s.artist_name || "?")[0]}
                      </div>
                    );
                  })}
                  {uniqueArtists.length > 3 && (
                    <div className="w-8 h-8 rounded-full border-2 border-card bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                      +{uniqueArtists.length - 3}
                    </div>
                  )}
                </div>

                <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
              </button>

              {isOpen && (
                <div className="border-t border-border">
                  {/* Context */}
                  {kw.context_ko && (
                    <div className="px-4 py-3 text-sm text-muted-foreground border-b border-border bg-muted/20">
                      {kw.context_ko}
                    </div>
                  )}

                  {/* Source contents */}
                  <div className="px-4 py-4 space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground tracking-wider flex items-center gap-1.5 mb-3">
                      <Users className="w-3.5 h-3.5" />
                      발견 컨텐츠 ({sources.length})
                    </h4>
                    {sources.map(src => {
                      const star = starMap.get(src.star_id);
                      const groupName = getGroupName(src.star_id);
                      return (
                        <div
                          key={src.id}
                          className="flex items-start gap-3 rounded-xl bg-muted/30 p-3 hover:bg-muted/50 transition-colors"
                        >
                          {star?.image_url ? (
                            <img src={star.image_url} alt={star.name_ko || star.display_name} className="w-10 h-10 rounded-full object-cover shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground shrink-0">
                              {(star?.name_ko || src.artist_name || "?")[0]}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                              <span className="text-sm font-bold text-foreground">
                                {star?.name_ko || src.artist_name}
                              </span>
                              {groupName && (
                                <span className="text-xs text-muted-foreground">· {groupName}</span>
                              )}
                              {src.commercial_intent && src.commercial_intent !== "organic" && (
                                <Badge variant="secondary" className="text-[9px] px-1 py-0">{src.commercial_intent}</Badge>
                              )}
                            </div>
                            {src.source_title && (
                              <p className="text-xs text-muted-foreground line-clamp-1 mb-1">{src.source_title}</p>
                            )}
                            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                              <span>{SOURCE_ICON[src.trigger_source] || "📄"} {SOURCE_LABEL[src.trigger_source] || src.trigger_source}</span>
                              <span>{timeAgo(src.created_at)}</span>
                              {src.confidence != null && (
                                <span className="text-primary font-semibold">신뢰도 {Math.round(Number(src.confidence) * 100)}%</span>
                              )}
                            </div>
                          </div>
                          {src.source_url && (
                            <a href={src.source_url} target="_blank" rel="noopener noreferrer" className="p-1.5 shrink-0">
                              <ExternalLink className="w-4 h-4 text-muted-foreground hover:text-primary transition-colors" />
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {!isLoading && keywords?.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">활성 키워드가 없습니다</div>
        )}
      </div>
    </div>
  );
};

export default KeywordInfluence;
