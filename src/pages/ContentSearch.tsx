import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import V3Header from "@/components/v3/V3Header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Search, Loader2, ExternalLink, Newspaper, BookOpen, Youtube, Music, Camera, MessageCircle, Database, Swords, Trophy, XCircle, Clock, Zap, BarChart3, FileText } from "lucide-react";
import AdminAutoReport from "@/pages/admin/AdminAutoReport";
import SEO from "@/components/SEO";
import SmartImage from "@/components/SmartImage";

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
  const queryClient = useQueryClient();
  const [searchText, setSearchText] = useState("");
  const [selectedStarId, setSelectedStarId] = useState<string | null>(null);
  const [selectedStarName, setSelectedStarName] = useState("");
  const [activeSource, setActiveSource] = useState<SourceKey | "all" | "no_image">("all");
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [viewMode, setViewMode] = useState<"search" | "collected" | "battle" | "prescore" | "report">(
    initialTab === "report" ? "report" : "search"
  );
  const [collectedStarId, setCollectedStarId] = useState<string | null>(null);
  const [collectedStarName, setCollectedStarName] = useState("");
  const [battleStarId, setBattleStarId] = useState<string | null>(null);
  const [battleStarName, setBattleStarName] = useState("");

  // Pre-score data
  const { data: prescoreData, isLoading: prescoreLoading, refetch: refetchPrescores } = useQuery({
    queryKey: ["battle-prescores"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("ktrenz_b2_prescores")
        .select("id, star_id, news_count, pre_score, batch_id, scored_at")
        .order("pre_score", { ascending: false });
      if (!data || data.length === 0) return { items: [], stars: {} };
      const starIds = [...new Set(data.map((d: any) => d.star_id))];
      const { data: stars } = await (supabase as any)
        .from("ktrenz_stars")
        .select("id, display_name, name_ko, image_url, star_type")
        .in("id", starIds);
      const starMap: Record<string, any> = {};
      (stars || []).forEach((s: any) => { starMap[s.id] = s; });
      return { items: data, stars: starMap, batchId: data[0]?.batch_id, scoredAt: data[0]?.scored_at };
    },
    enabled: viewMode === "prescore",
    staleTime: 30000,
  });

  // Pre-score collection mutation with chunked processing
  const [prescoreProgress, setPrescoreProgress] = useState<{ processed: number; total: number } | null>(null);
  const prescoreMutation = useMutation({
    mutationFn: async () => {
      setPrescoreProgress(null);
      let offset = 0;
      let batchId: string | undefined;
      let lastData: any = null;

      while (true) {
        const { data, error } = await supabase.functions.invoke("ktrenz-battle-prescore", {
          body: { offset, batch_id: batchId },
        });
        if (error) throw error;
        lastData = data;
        batchId = data.batch_id;

        if (data.phase === "scoring" && data.has_more) {
          setPrescoreProgress({ processed: data.processed, total: data.total });
          offset = data.processed;
        } else {
          setPrescoreProgress(null);
          return lastData;
        }
      }
    },
    onSuccess: () => {
      refetchPrescores();
    },
  });

  // Batch queue status
  const { data: batchStatus, refetch: refetchBatchStatus } = useQuery({
    queryKey: ["battle-batch-status"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("ktrenz-battle-autobatch", {
        body: { action: "status" },
      });
      if (error) return null;
      return data;
    },
    enabled: viewMode === "prescore",
    staleTime: 5000,
    refetchInterval: (query) => {
      const d = query.state.data;
      if (d && (d.pending > 0 || d.running > 0)) return 3000;
      return false;
    },
  });

  // Start batch collection
  const startBatchMutation = useMutation({
    mutationFn: async (batchId: string) => {
      // Start the queue with batch_id (cooldown + tier selection happens server-side)
      const { data: startResult, error: startErr } = await supabase.functions.invoke("ktrenz-battle-autobatch", {
        body: { action: "start", batch_id: batchId },
      });
      if (startErr) throw startErr;

      // Process all items sequentially by polling
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase.functions.invoke("ktrenz-battle-autobatch", {
          body: { action: "process_next" },
        });
        if (error) throw error;
        hasMore = data?.has_more ?? false;
        refetchBatchStatus();
      }

      return startResult;
    },
    onSuccess: () => {
      refetchBatchStatus();
    },
  });

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
  const { data: contentData, isLoading: contentLoading } = useQuery({
    queryKey: ["content-search", selectedStarId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("ktrenz-content-search", {
        body: { star_id: selectedStarId },
      });
      if (error) throw error;
      // Invalidate collected artists so the list refreshes after a new search/collection
      queryClient.invalidateQueries({ queryKey: ["collected-artists"] });
      return data;
    },
    enabled: !!selectedStarId,
    staleTime: 60000,
  });

  // Collected artists (stars with B2 runs)
  const { data: collectedArtists } = useQuery({
    queryKey: ["collected-artists"],
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("get_collected_artists_summary");
      if (data) return data;
      // Fallback: manual query
      const { data: runs } = await (supabase as any)
        .from("ktrenz_b2_runs")
        .select("star_id, content_score, created_at");
      if (!runs || runs.length === 0) return [];
      const starMap = new Map<string, { star_id: string; run_count: number; max_score: number; last_run: string }>();
      for (const r of runs) {
        const existing = starMap.get(r.star_id);
        if (!existing) {
          starMap.set(r.star_id, { star_id: r.star_id, run_count: 1, max_score: r.content_score, last_run: r.created_at });
        } else {
          existing.run_count++;
          if (r.content_score > existing.max_score) existing.max_score = r.content_score;
          if (r.created_at > existing.last_run) existing.last_run = r.created_at;
        }
      }
      const starIds = Array.from(starMap.keys());
      const { data: stars } = await (supabase as any)
        .from("ktrenz_stars")
        .select("id, display_name, name_ko, image_url")
        .in("id", starIds);
      return (stars || []).map((s: any) => ({
        ...s,
        ...starMap.get(s.id),
      })).sort((a: any, b: any) => new Date(b.last_run).getTime() - new Date(a.last_run).getTime());
    },
    staleTime: 60000,
  });

  // Collected items for a specific star
  const { data: collectedItems, isLoading: collectedLoading } = useQuery({
    queryKey: ["collected-items", collectedStarId],
    queryFn: async () => {
      const { data: runs } = await (supabase as any)
        .from("ktrenz_b2_runs")
        .select("id, content_score, created_at")
        .eq("star_id", collectedStarId)
        .order("created_at", { ascending: false });

      if (!runs || runs.length === 0) return [];

      const bestRun = runs.reduce((best: any, current: any) => {
        if (!best) return current;
        return current.content_score > best.content_score ? current : best;
      }, null);

      if (!bestRun?.id) return [];

      const { data: items } = await (supabase as any)
        .from("ktrenz_b2_items")
        .select("id, source, title, description, url, thumbnail, has_thumbnail, engagement_score, published_at, metadata, run_id")
        .eq("run_id", bestRun.id)
        .eq("has_thumbnail", true)
        .not("source", "eq", "naver_blog")
        .order("engagement_score", { ascending: false })
        .limit(8);

      return items || [];
    },
    enabled: !!collectedStarId,
    staleTime: 60000,
  });

  // Battle history for the selected collected star
  const { data: battleHistory } = useQuery({
    queryKey: ["battle-history", collectedStarId],
    queryFn: async () => {
      // Get all run IDs for this star
      const { data: runs } = await (supabase as any)
        .from("ktrenz_b2_runs")
        .select("id, content_score, created_at")
        .eq("star_id", collectedStarId);
      if (!runs || runs.length === 0) return [];

      const runIds = runs.map((r: any) => r.id);

      // Get predictions where this star was picked or was opponent
      const { data: asPicked } = await (supabase as any)
        .from("b2_predictions")
        .select("id, picked_run_id, opponent_run_id, band, status, reward_amount, settled_at, battle_date, user_id")
        .in("picked_run_id", runIds);

      const { data: asOpponent } = await (supabase as any)
        .from("b2_predictions")
        .select("id, picked_run_id, opponent_run_id, band, status, reward_amount, settled_at, battle_date, user_id")
        .in("opponent_run_id", runIds);

      // Combine and deduplicate
      const all = [...(asPicked || []), ...(asOpponent || [])];
      const unique = Array.from(new Map(all.map((p: any) => [p.id, p])).values());

      // Get opponent star info
      const opponentRunIds = unique.map((p: any) =>
        runIds.includes(p.picked_run_id) ? p.opponent_run_id : p.picked_run_id
      );
      const { data: opponentRuns } = await (supabase as any)
        .from("ktrenz_b2_runs")
        .select("id, star_id, content_score")
        .in("id", [...new Set(opponentRunIds)]);

      const opponentRunMap = new Map((opponentRuns || []).map((r: any) => [r.id, r]));
      const opponentStarIds = [...new Set((opponentRuns || []).map((r: any) => r.star_id))];
      const { data: opponentStars } = await (supabase as any)
        .from("ktrenz_stars")
        .select("id, display_name, name_ko, image_url")
        .in("id", opponentStarIds);
      const starMap = new Map((opponentStars || []).map((s: any) => [s.id, s]));

      return unique.map((p: any) => {
        const isPickedStar = runIds.includes(p.picked_run_id);
        const opponentRunId = isPickedStar ? p.opponent_run_id : p.picked_run_id;
        const opponentRun = opponentRunMap.get(opponentRunId);
        const opponentStar = opponentRun ? starMap.get((opponentRun as any).star_id) : null;
        return {
          ...p,
          isPickedStar,
          opponentName: (opponentStar as any)?.display_name || "Unknown",
          opponentImage: (opponentStar as any)?.image_url,
        };
      }).sort((a: any, b: any) => new Date(b.battle_date).getTime() - new Date(a.battle_date).getTime());
    },
    enabled: !!collectedStarId,
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
    setCollectedStarId(null);
    setCollectedStarName("");
  }, []);

  const selectCollectedStar = useCallback((star: any) => {
    setCollectedStarId(star.id);
    setCollectedStarName(star.name_ko || star.display_name);
    setActiveSource("all");
  }, []);

  const allItems = contentData?.sources
    ? (activeSource === "all"
      ? ALL_SOURCES.flatMap((s) => contentData.sources[s] || [])
      : activeSource === "no_image"
      ? ALL_SOURCES.flatMap((s) => contentData.sources[s] || []).filter((item: any) => !item.thumbnail)
      : contentData.sources[activeSource] || []
    )
    : [];

  const noImageCount = contentData?.sources
    ? ALL_SOURCES.flatMap((s) => contentData.sources[s] || []).filter((item: any) => !item.thumbnail).length
    : 0;

  // Filter collected items by source
  const filteredCollected = collectedItems
    ? (activeSource === "all"
      ? collectedItems
      : activeSource === "no_image"
      ? collectedItems.filter((item: any) => !item.thumbnail)
      : collectedItems.filter((item: any) => item.source === activeSource)
    )
    : [];

  const collectedSourceCounts = collectedItems
    ? ALL_SOURCES.reduce((acc, s) => {
        acc[s] = collectedItems.filter((item: any) => item.source === s).length;
        return acc;
      }, {} as Record<string, number>)
    : {};

  const collectedNoImageCount = collectedItems
    ? collectedItems.filter((item: any) => !item.thumbnail).length
    : 0;

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

          {/* Mode tabs */}
          <div className="flex gap-1 p-1 bg-muted rounded-xl mb-4">
            <TabButton active={viewMode === "search"} onClick={() => { setViewMode("search"); setCollectedStarId(null); }}>
              <Search className="w-3.5 h-3.5" /> 실시간 검색
            </TabButton>
            <TabButton active={viewMode === "collected"} onClick={() => { setViewMode("collected"); clearSelection(); }}>
              <Database className="w-3.5 h-3.5" /> 수집 아티스트
              {collectedArtists && collectedArtists.length > 0 && (
                <span className="text-[10px] opacity-60">({collectedArtists.length})</span>
              )}
            </TabButton>
            <TabButton active={viewMode === "prescore"} onClick={() => { setViewMode("prescore"); clearSelection(); }}>
              <Zap className="w-3.5 h-3.5" /> 가점수
              {prescoreData?.items?.length > 0 && (
                <span className="text-[10px] opacity-60">({prescoreData.items.filter((i: any) => i.news_count > 0).length})</span>
              )}
            </TabButton>
            <TabButton active={viewMode === "report"} onClick={() => { setViewMode("report"); clearSelection(); }}>
              <FileText className="w-3.5 h-3.5" /> 리포트
            </TabButton>
          </div>

          {viewMode === "search" && (
            <>
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
            </>
          )}
        </div>

        {/* === SEARCH MODE === */}
        {viewMode === "search" && (
          <>
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

                <SourceTabs
                  activeSource={activeSource}
                  setActiveSource={setActiveSource}
                  counts={contentData.counts}
                  noImageCount={noImageCount}
                />

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

            {!selectedStarId && !contentLoading && (
              <div className="text-center py-16 text-muted-foreground">
                <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Search for a star to find related content</p>
                <p className="text-xs mt-1">Naver · YouTube · TikTok · Instagram · Reddit</p>
              </div>
            )}
          </>
        )}

        {/* === COLLECTED MODE === */}
        {viewMode === "collected" && (
          <>
            {!collectedStarId ? (
              /* Artist list */
              <div className="space-y-2">
                {(!collectedArtists || collectedArtists.length === 0) && (
                  <div className="text-center py-16 text-muted-foreground">
                    <Database className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">수집된 아티스트가 없습니다</p>
                  </div>
                )}
                {collectedArtists?.map((artist: any) => (
                  <button
                    key={artist.id}
                    onClick={() => selectCollectedStar(artist)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border/40 hover:border-primary/30 transition-all text-left"
                  >
                    {artist.image_url ? (
                      <img src={artist.image_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground">
                        {(artist.display_name || "?")[0]}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">{artist.display_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {artist.name_ko && artist.name_ko !== artist.display_name && <span>{artist.name_ko} · </span>}
                        {artist.run_count}회 수집 · 스코어 {artist.max_score}
                      </p>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{timeAgo(artist.last_run)}</span>
                  </button>
                ))}
              </div>
            ) : (
              /* Collected items for selected star */
              <>
                <button
                  onClick={() => { setCollectedStarId(null); setCollectedStarName(""); setActiveSource("all"); }}
                  className="flex items-center gap-2 text-sm text-primary font-medium mb-4 hover:underline"
                >
                  ← {collectedStarName} 콘텐츠
                </button>

                {collectedLoading && (
                  <div className="space-y-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-20 rounded-xl" />
                    ))}
                  </div>
                )}

                {collectedItems && !collectedLoading && (
                  <>
                    {/* Battle History */}
                    {battleHistory && battleHistory.length > 0 && (
                      <div className="mb-6">
                        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                          <Swords className="w-4 h-4 text-primary" />
                          배틀 전적
                          <span className="text-xs text-muted-foreground font-normal">
                            ({battleHistory.filter((b: any) => b.status === "won" && b.isPickedStar).length}W / 
                            {battleHistory.filter((b: any) => b.status === "lost" && b.isPickedStar).length}L / 
                            {battleHistory.filter((b: any) => b.status === "pending").length}P)
                          </span>
                        </h3>
                        <div className="space-y-2">
                          {battleHistory.map((battle: any) => (
                            <div
                              key={battle.id}
                              className={cn(
                                "flex items-center gap-3 px-3 py-2.5 rounded-xl border",
                                battle.status === "won" ? "bg-emerald-500/5 border-emerald-500/20" :
                                battle.status === "lost" ? "bg-red-500/5 border-red-500/20" :
                                "bg-muted/50 border-border/40"
                              )}
                            >
                              {/* Status icon */}
                              {battle.status === "won" ? (
                                <Trophy className="w-4 h-4 text-emerald-500 shrink-0" />
                              ) : battle.status === "lost" ? (
                                <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                              ) : (
                                <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                              )}
                              {/* Opponent info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-medium text-foreground">vs {battle.opponentName}</span>
                                  <span className={cn(
                                    "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                                    battle.band === "surge" ? "bg-red-500/10 text-red-500" :
                                    battle.band === "rising" ? "bg-orange-500/10 text-orange-500" :
                                    "bg-emerald-500/10 text-emerald-500"
                                  )}>
                                    {battle.band}
                                  </span>
                                </div>
                                <p className="text-[10px] text-muted-foreground">
                                  {battle.battle_date} · {battle.isPickedStar ? "이 아티스트 선택됨" : "상대로 선택됨"}
                                </p>
                              </div>
                              {/* Reward */}
                              {battle.status === "won" && battle.reward_amount > 0 && (
                                <span className="text-xs font-bold text-emerald-500">+{battle.reward_amount}P</span>
                              )}
                              {battle.status === "pending" && (
                                <span className="text-[10px] text-muted-foreground">대기중</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Source filter tabs */}
                    <div className="flex gap-1 p-1 bg-muted rounded-xl mb-4 overflow-x-auto">
                      <TabButton active={activeSource === "all"} onClick={() => setActiveSource("all")}>
                        전체 ({collectedItems.length})
                      </TabButton>
                      {ALL_SOURCES.map((s) => {
                        const count = collectedSourceCounts[s] || 0;
                        if (count === 0) return null;
                        const cfg = SOURCE_CONFIG[s];
                        const Icon = cfg.icon;
                        return (
                          <TabButton key={s} active={activeSource === s} onClick={() => setActiveSource(s)}>
                            <Icon className={cn("w-3.5 h-3.5", cfg.color)} />
                            <span className="text-[10px] opacity-60">({count})</span>
                          </TabButton>
                        );
                      })}
                      {collectedNoImageCount > 0 && (
                        <TabButton active={activeSource === "no_image"} onClick={() => setActiveSource("no_image")}>
                          🚫 <span className="text-[10px] opacity-60">({collectedNoImageCount})</span>
                        </TabButton>
                      )}
                    </div>

                    <div className="space-y-2">
                      {filteredCollected.length === 0 && (
                        <div className="text-center py-12 text-muted-foreground">
                          <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
                          <p className="text-sm">콘텐츠 없음</p>
                        </div>
                      )}
                      {filteredCollected.map((item: any, idx: number) => (
                        <ContentCard key={`${item.id}-${idx}`} item={item} />
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}

        {/* === PRESCORE MODE === */}
        {viewMode === "prescore" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  네이버 뉴스 가점수
                </h2>
                {prescoreData?.scoredAt && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    배치 {prescoreData.batchId} · {timeAgo(prescoreData.scoredAt)}
                  </p>
                )}
              </div>
              <Button
                size="sm"
                onClick={() => prescoreMutation.mutate()}
                disabled={prescoreMutation.isPending}
                className="rounded-full gap-1.5"
              >
                {prescoreMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Zap className="w-3.5 h-3.5" />
                )}
                {prescoreMutation.isPending
                  ? prescoreProgress
                    ? `${prescoreProgress.processed}/${prescoreProgress.total}`
                    : "수집중..."
                  : "전체 수집"}
              </Button>
            </div>

            {prescoreMutation.isSuccess && prescoreMutation.data && (
              <div className="mb-4 p-3 rounded-xl bg-primary/5 border border-primary/20 space-y-2">
                <p className="text-xs font-medium text-foreground">
                  ✅ {prescoreMutation.data.total_stars}명 스코어링 · {prescoreMutation.data.scored}명 기사 발견 · 쿨다운 제외 {prescoreMutation.data.cooldown_excluded}명
                </p>
                {prescoreMutation.data.selected && prescoreMutation.data.selected.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[10px] font-semibold text-foreground">
                        🎯 배틀 선발 {prescoreMutation.data.selected_count}명
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full gap-1 h-7 text-[10px]"
                        disabled={startBatchMutation.isPending}
                        onClick={() => {
                          const bId = prescoreData?.batchId || prescoreMutation.data?.batch_id;
                          if (bId) startBatchMutation.mutate(bId);
                        }}
                      >
                        {startBatchMutation.isPending ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Zap className="w-3 h-3" />
                        )}
                        {startBatchMutation.isPending ? "수집중..." : "콘텐츠 일괄수집"}
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {prescoreMutation.data.selected.map((s: any) => (
                        <span key={s.star_id} className={cn(
                          "text-[10px] px-2 py-0.5 rounded-full border",
                          s.is_cooldown ? "bg-muted text-muted-foreground border-border" : "bg-primary/10 text-primary border-primary/20"
                        )}>
                          {s.name_ko || s.name} ({s.news_count})
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Batch progress */}
            {batchStatus && batchStatus.total > 0 && (
              <div className="mb-4 p-3 rounded-xl bg-muted/50 border border-border space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-foreground">
                    📦 배치 수집 진행 ({batchStatus.done + batchStatus.error}/{batchStatus.total})
                  </p>
                  <div className="flex items-center gap-2">
                    {(batchStatus.pending > 0 || batchStatus.running > 0) && (
                      <>
                        <button
                          className="text-[10px] text-destructive hover:underline"
                          onClick={async () => {
                            await supabase.functions.invoke("ktrenz-battle-autobatch", {
                              body: { action: "clear" },
                            });
                            refetchBatchStatus();
                          }}
                        >
                          중단
                        </button>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                      </>
                    )}
                  </div>
                </div>
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-primary h-full rounded-full transition-all duration-500"
                    style={{ width: `${((batchStatus.done + batchStatus.error) / batchStatus.total) * 100}%` }}
                  />
                </div>
                <div className="flex flex-wrap gap-1">
                  {(batchStatus.items || []).map((item: any) => (
                    <span key={item.id} className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full",
                      item.status === "done" ? "bg-primary/10 text-primary" :
                      item.status === "error" ? "bg-destructive/10 text-destructive" :
                      item.status === "running" ? "bg-amber-500/10 text-amber-600" :
                      "bg-muted text-muted-foreground"
                    )}>
                      {item.star_name_ko || item.star_name}
                      {item.status === "done" && item.result?.content_score ? ` (${item.result.content_score})` : ""}
                      {item.status === "error" ? " ✗" : item.status === "done" ? " ✓" : item.status === "running" ? " ⟳" : ""}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {prescoreMutation.isError && (
              <div className="mb-4 p-3 rounded-xl bg-destructive/5 border border-destructive/20">
                <p className="text-xs text-destructive">수집 실패: {String(prescoreMutation.error)}</p>
              </div>
            )}

            {prescoreLoading && (
              <div className="space-y-2">
                {Array.from({ length: 10 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 rounded-xl" />
                ))}
              </div>
            )}

            {!prescoreLoading && (!prescoreData?.items || prescoreData.items.length === 0) && (
              <div className="text-center py-16 text-muted-foreground">
                <Zap className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">가점수 데이터가 없습니다</p>
                <p className="text-xs mt-1">「전체 수집」버튼으로 네이버 뉴스 기사수를 수집하세요</p>
              </div>
            )}

            {prescoreData?.items && prescoreData.items.length > 0 && (
              <div className="space-y-1.5">
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="p-3 rounded-xl bg-muted/50 text-center">
                    <p className="text-lg font-bold text-foreground">{prescoreData.items.length}</p>
                    <p className="text-[10px] text-muted-foreground">전체</p>
                  </div>
                  <div className="p-3 rounded-xl bg-muted/50 text-center">
                    <p className="text-lg font-bold text-foreground">{prescoreData.items.filter((i: any) => i.news_count > 0).length}</p>
                    <p className="text-[10px] text-muted-foreground">기사 있음</p>
                  </div>
                  <div className="p-3 rounded-xl bg-muted/50 text-center">
                    <p className="text-lg font-bold text-primary">
                      {prescoreData.items.length > 0
                        ? Math.round(prescoreData.items.reduce((s: number, i: any) => s + i.news_count, 0) / prescoreData.items.length)
                        : 0}
                    </p>
                    <p className="text-[10px] text-muted-foreground">평균 기사수</p>
                  </div>
                </div>

                {prescoreData.items.map((item: any, idx: number) => {
                  const star = prescoreData.stars[item.star_id];
                  if (!star) return null;
                  const maxScore = prescoreData.items[0]?.pre_score || 1;
                  const barWidth = Math.max(2, (item.pre_score / maxScore) * 100);
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-card border border-border/40 relative overflow-hidden"
                    >
                      <div
                        className="absolute inset-y-0 left-0 bg-primary/5"
                        style={{ width: `${barWidth}%` }}
                      />
                      <span className={cn(
                        "text-xs font-bold w-6 text-center shrink-0 relative z-10",
                        idx < 3 ? "text-primary" : "text-muted-foreground"
                      )}>
                        {idx + 1}
                      </span>
                      {star.image_url ? (
                        <img src={star.image_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0 relative z-10" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0 relative z-10">
                          {(star.display_name || "?")[0]}
                        </div>
                      )}
                      <div className="flex-1 min-w-0 relative z-10">
                        <p className="text-sm font-medium text-foreground truncate">{star.display_name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {star.name_ko && star.name_ko !== star.display_name && `${star.name_ko} · `}
                          {star.star_type}
                        </p>
                      </div>
                      <div className="text-right shrink-0 relative z-10">
                        <p className={cn(
                          "text-sm font-bold",
                          item.news_count > 0 ? "text-foreground" : "text-muted-foreground"
                        )}>
                          {item.news_count.toLocaleString()}
                        </p>
                        <p className="text-[10px] text-muted-foreground">기사</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* === REPORT MODE === */}
        {viewMode === "report" && (
          <AdminAutoReport />
        )}
      </main>
    </div>
  );
};

function SourceTabs({ activeSource, setActiveSource, counts, noImageCount }: {
  activeSource: string;
  setActiveSource: (s: any) => void;
  counts: any;
  noImageCount: number;
}) {
  return (
    <div className="flex gap-1 p-1 bg-muted rounded-xl mb-4 overflow-x-auto">
      <TabButton active={activeSource === "all"} onClick={() => setActiveSource("all")}>
        All ({counts?.total || 0})
      </TabButton>
      {ALL_SOURCES.map((s) => {
        const cfg = SOURCE_CONFIG[s];
        const count = counts?.[s] || 0;
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
      {noImageCount > 0 && (
        <TabButton active={activeSource === "no_image"} onClick={() => setActiveSource("no_image")}>
          <span className="text-muted-foreground">🚫</span>
          <span className="hidden sm:inline">No Image</span>
          <span className="text-[10px] opacity-60">({noImageCount})</span>
        </TabButton>
      )}
    </div>
  );
}

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
          <div className="absolute inset-0 opacity-10">
            <div className="absolute -top-2 -right-2 w-12 h-12 rounded-full border-2 border-white/40" />
            <div className="absolute -bottom-3 -left-3 w-16 h-16 rounded-full border border-white/20" />
          </div>
          <p className="text-[8px] leading-[10px] font-semibold text-white text-center line-clamp-3 relative z-10 break-all">
            {(item.title || "").replace(/<[^>]*>/g, "").slice(0, 50)}
          </p>
          <Icon className="w-3 h-3 text-white/50 mt-auto relative z-10" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <Icon className={cn("w-3 h-3 shrink-0", cfg.color)} />
          <span className="text-[10px] text-muted-foreground font-medium">{cfg.label}</span>
          {(item.date || item.published_at) && (
            <span className="text-[10px] text-muted-foreground">
              · {timeAgo(item.date || item.published_at)}
            </span>
          )}
        </div>
        <h3 className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-primary transition-colors">
          {item.title || "Untitled"}
        </h3>
        {item.description && (
          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{item.description}</p>
        )}
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
          {item.engagement_score > 0 && (
            <span className="text-[10px] text-muted-foreground">🔥 {item.engagement_score}</span>
          )}
        </div>
      </div>
      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
    </a>
  );
}

function timeAgo(dateStr: string) {
  if (!dateStr) return "";
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
