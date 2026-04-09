import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import V3Header from "@/components/v3/V3Header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Search, Loader2, ExternalLink, Newspaper, BookOpen, Youtube, Music, Camera, MessageCircle } from "lucide-react";
import SEO from "@/components/SEO";

type SourceKey = "naver_news" | "naver_blog" | "youtube" | "tiktok" | "instagram" | "reddit";

const SOURCE_CONFIG: Record<SourceKey, { label: string; icon: typeof Newspaper; color: string }> = {
  naver_news: { label: "Naver News", icon: Newspaper, color: "text-green-500" },
  naver_blog: { label: "Naver Blog", icon: BookOpen, color: "text-green-400" },
  youtube: { label: "YouTube", icon: Youtube, color: "text-red-500" },
  tiktok: { label: "TikTok", icon: Music, color: "text-foreground" },
  instagram: { label: "Instagram", icon: Camera, color: "text-pink-500" },
  reddit: { label: "Reddit", icon: MessageCircle, color: "text-orange-500" },
};

const ALL_SOURCES: SourceKey[] = ["naver_news", "naver_blog", "youtube", "tiktok", "instagram", "reddit"];

const ContentSearchPage = () => {
  const [searchText, setSearchText] = useState("");
  const [selectedStarId, setSelectedStarId] = useState<string | null>(null);
  const [selectedStarName, setSelectedStarName] = useState("");
  const [activeSource, setActiveSource] = useState<SourceKey | "all">("all");

  // Star search
  const { data: starResults, isLoading: starsLoading } = useQuery({
    queryKey: ["star-search", searchText],
    queryFn: async () => {
      if (searchText.length < 2) return [];
      const { data } = await (supabase as any)
        .from("ktrenz_stars")
        .select("id, display_name, name_ko, star_type, image_url")
        .or(`display_name.ilike.%${searchText}%,name_ko.ilike.%${searchText}%`)
        .limit(10);
      return data || [];
    },
    enabled: searchText.length >= 2 && !selectedStarId,
    staleTime: 30000,
  });

  // Content search
  const { data: contentData, isLoading: contentLoading, isFetching } = useQuery({
    queryKey: ["content-search", selectedStarId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("ktrenz-content-search", {
        body: { star_id: selectedStarId },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedStarId,
    staleTime: 60000,
  });

  const selectStar = useCallback((star: any) => {
    setSelectedStarId(star.id);
    setSelectedStarName(star.name_ko || star.display_name);
    setSearchText(star.name_ko || star.display_name);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedStarId(null);
    setSelectedStarName("");
    setSearchText("");
    setActiveSource("all");
  }, []);

  const allItems = contentData?.sources
    ? (activeSource === "all"
      ? ALL_SOURCES.flatMap((s) => contentData.sources[s] || [])
      : contentData.sources[activeSource] || []
    )
    : [];

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Content Search" description="Search content across platforms" />
      <V3Header />
      <main className="max-w-3xl mx-auto px-4 pb-24">
        {/* Search */}
        <div className="pt-6 pb-4">
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2 mb-4">
            <Search className="w-5 h-5 text-primary" />
            Content Search
          </h1>
          <div className="relative">
            <Input
              placeholder="Search star name..."
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                if (selectedStarId) clearSelection();
              }}
              className="pr-20"
            />
            {selectedStarId && (
              <Button variant="ghost" size="sm" onClick={clearSelection} className="absolute right-1 top-1/2 -translate-y-1/2 text-xs h-7">
                Clear
              </Button>
            )}
          </div>
          {/* Star dropdown */}
          {!selectedStarId && starResults && starResults.length > 0 && (
            <div className="mt-1 border border-border rounded-xl bg-card shadow-lg overflow-hidden">
              {starResults.map((star: any) => (
                <button
                  key={star.id}
                  onClick={() => selectStar(star)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                >
                  {star.image_url ? (
                    <img src={star.image_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                      {(star.display_name || "?")[0]}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-foreground">{star.display_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {star.name_ko && star.name_ko !== star.display_name && <span>{star.name_ko} · </span>}
                      {star.star_type}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Loading */}
        {contentLoading && (
          <div className="space-y-3 mt-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        )}

        {/* Results */}
        {contentData && !contentLoading && (
          <>
            {/* Content Score */}
            {contentData.counts?.content_score > 0 && (
              <div className="flex items-center gap-3 px-4 py-3 mb-4 rounded-xl bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/15">
                  <Search className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Content Score</p>
                  <p className="text-2xl font-bold text-foreground">{contentData.counts.content_score.toLocaleString()}</p>
                </div>
                <div className="ml-auto text-[10px] text-muted-foreground text-right leading-relaxed">
                  {contentData.counts.naver_news_raw > 0 && <div>News {contentData.counts.naver_news_raw}</div>}
                  {contentData.counts.naver_blog_raw > 0 && <div>Blog {contentData.counts.naver_blog_raw}</div>}
                  {contentData.counts.youtube_raw > 0 && <div>YT {contentData.counts.youtube_raw}</div>}
                  {contentData.counts.tiktok_raw > 0 && <div>TT {contentData.counts.tiktok_raw}</div>}
                  {contentData.counts.instagram_raw > 0 && <div>IG {contentData.counts.instagram_raw}</div>}
                  {contentData.counts.reddit_raw > 0 && <div>RD {contentData.counts.reddit_raw}</div>}
                </div>
              </div>
            )}

            {/* Source tabs */}
            <div className="flex gap-1 p-1 bg-muted rounded-xl mb-4 overflow-x-auto">
              <TabButton active={activeSource === "all"} onClick={() => setActiveSource("all")}>
                All ({contentData.counts?.total || 0})
              </TabButton>
              {ALL_SOURCES.map((s) => {
                const cfg = SOURCE_CONFIG[s];
                const count = contentData.counts?.[s] || 0;
                if (count === 0) return null;
                const Icon = cfg.icon;
                return (
                  <TabButton key={s} active={activeSource === s} onClick={() => setActiveSource(s)}>
                    <Icon className={cn("w-3.5 h-3.5", cfg.color)} />
                    <span className="hidden sm:inline">{cfg.label}</span>
                    <span className="text-[10px] opacity-60">({count})</span>
                  </TabButton>
                );
              })}
            </div>

            {/* Content list */}
            <div className="space-y-2">
              {allItems.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No content found</p>
                </div>
              )}
              {allItems.map((item: any, idx: number) => (
                <ContentCard key={`${item.source}-${idx}`} item={item} />
              ))}
            </div>
          </>
        )}

        {/* Empty state */}
        {!selectedStarId && !contentLoading && (
          <div className="text-center py-16 text-muted-foreground">
            <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Search for a star to find related content</p>
            <p className="text-xs mt-1">Naver · YouTube · TikTok · Instagram · Reddit</p>
          </div>
        )}
      </main>
    </div>
  );
};

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function ContentCard({ item }: { item: any }) {
  const cfg = SOURCE_CONFIG[item.source as SourceKey];
  const Icon = cfg?.icon || Newspaper;
  const [imgError, setImgError] = useState(false);

  if (!cfg) return null;

  // Generate a deterministic gradient from source + title
  const GRADIENTS: Record<string, string> = {
    naver_news: "from-green-600/90 to-emerald-800/90",
    naver_blog: "from-emerald-500/90 to-teal-700/90",
    youtube: "from-red-600/90 to-rose-800/90",
    tiktok: "from-slate-800/90 to-zinc-900/90",
    instagram: "from-pink-500/90 via-purple-500/90 to-orange-400/90",
    reddit: "from-orange-500/90 to-red-700/90",
  };

  const hasThumbnail = item.thumbnail && !imgError;

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex gap-3 p-3 rounded-xl bg-card border border-border/40 hover:border-border transition-colors group"
    >
      {/* Thumbnail or stylized title card */}
      {hasThumbnail ? (
        <img
          src={item.thumbnail}
          alt=""
          className="w-20 h-20 rounded-lg object-cover shrink-0 bg-muted"
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setImgError(true)}
        />
      ) : (
        <div
          className={cn(
            "w-20 h-20 rounded-lg shrink-0 flex flex-col items-center justify-center p-1.5 relative overflow-hidden",
            "bg-gradient-to-br",
            GRADIENTS[item.source] || "from-muted to-muted-foreground/20"
          )}
        >
          {/* Decorative pattern */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute -top-2 -right-2 w-12 h-12 rounded-full border-2 border-white/40" />
            <div className="absolute -bottom-3 -left-3 w-16 h-16 rounded-full border border-white/20" />
          </div>
          {/* Title excerpt */}
          <p className="text-[8px] leading-[10px] font-semibold text-white text-center line-clamp-3 relative z-10 break-all">
            {(item.title || "").replace(/<[^>]*>/g, "").slice(0, 50)}
          </p>
          {/* Source icon watermark */}
          <Icon className="w-3 h-3 text-white/50 mt-auto relative z-10" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <Icon className={cn("w-3 h-3 shrink-0", cfg.color)} />
          <span className="text-[10px] text-muted-foreground font-medium">{cfg.label}</span>
          {item.date && (
            <span className="text-[10px] text-muted-foreground">
              · {timeAgo(item.date)}
            </span>
          )}
        </div>
        <h3 className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-primary transition-colors">
          {item.title || "Untitled"}
        </h3>
        {item.description && (
          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{item.description}</p>
        )}
        {/* Metadata */}
        <div className="flex items-center gap-2 mt-1">
          {item.metadata?.channelTitle && (
            <span className="text-[10px] text-muted-foreground">{item.metadata.channelTitle}</span>
          )}
          {item.metadata?.author && (
            <span className="text-[10px] text-muted-foreground">@{item.metadata.author}</span>
          )}
          {item.metadata?.plays > 0 && (
            <span className="text-[10px] text-muted-foreground">{formatNum(item.metadata.plays)} plays</span>
          )}
          {item.metadata?.likes > 0 && (
            <span className="text-[10px] text-muted-foreground">♥ {formatNum(item.metadata.likes)}</span>
          )}
          {item.metadata?.comments > 0 && (
            <span className="text-[10px] text-muted-foreground">💬 {formatNum(item.metadata.comments)}</span>
          )}
          {item.metadata?.subreddit && (
            <span className="text-[10px] text-muted-foreground">r/{item.metadata.subreddit}</span>
          )}
        </div>
      </div>
      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
    </a>
  );
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "Just now";
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

function formatNum(n: number) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return String(n);
}

export default ContentSearchPage;
