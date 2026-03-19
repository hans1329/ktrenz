import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Loader2, Play, TrendingUp, Search, Clock, Globe,
  ArrowUpRight, ArrowDownRight, Minus, RefreshCw, Zap,
  XCircle, Trash2, Filter
} from "lucide-react";
import { cn } from "@/lib/utils";

const REGIONS = ["worldwide", "KR", "US", "JP"] as const;
const CATEGORY_COLORS: Record<string, string> = {
  brand: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  product: "bg-purple-500/10 text-purple-600 border-purple-500/30",
  place: "bg-green-500/10 text-green-600 border-green-500/30",
  food: "bg-orange-500/10 text-orange-600 border-orange-500/30",
  fashion: "bg-pink-500/10 text-pink-600 border-pink-500/30",
  beauty: "bg-rose-500/10 text-rose-600 border-rose-500/30",
  media: "bg-cyan-500/10 text-cyan-600 border-cyan-500/30",
};

const formatAge = (dateStr: string): string => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "방금";
  if (hours < 24) return `${hours}h 전`;
  const days = Math.floor(hours / 24);
  return `${days}d 전`;
};

const AdminTrendIntel = () => {
  const queryClient = useQueryClient();
  const [selectedRegion, setSelectedRegion] = useState<string>("worldwide");
  const [artistFilter, setArtistFilter] = useState<string>("");
  // Fetch active triggers
  const { data: triggers, isLoading: triggersLoading } = useQuery({
    queryKey: ["admin-trend-triggers"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ktrenz_trend_triggers" as any)
        .select("*")
        .in("status", ["active", "expired"])
        .order("detected_at", { ascending: false })
        .limit(100);
      return (data ?? []) as any[];
    },
    refetchInterval: 30_000,
  });

  // Fetch tracking data
  const { data: trackingData, isLoading: trackingLoading } = useQuery({
    queryKey: ["admin-trend-tracking", selectedRegion],
    queryFn: async () => {
      const query = supabase
        .from("ktrenz_trend_tracking" as any)
        .select("*")
        .order("tracked_at", { ascending: false })
        .limit(200);

      if (selectedRegion !== "all") {
        query.eq("region", selectedRegion);
      }

      const { data } = await query;
      return (data ?? []) as any[];
    },
    refetchInterval: 30_000,
  });

  // Run detect
  const detectMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("ktrenz-trend-cron", {
        body: { phase: "detect", batchSize: 5, batchOffset: 0 },
      });
      if (error) throw error;
      return typeof data === "string" ? JSON.parse(data) : data;
    },
    onSuccess: (data) => {
      toast.success(`키워드 감지 완료: ${data?.detect?.totalKeywords ?? 0}건 추출`);
      queryClient.invalidateQueries({ queryKey: ["admin-trend-triggers"] });
    },
    onError: (err) => toast.error(`감지 실패: ${(err as Error).message}`),
  });

  // Run track
  const trackMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("ktrenz-trend-cron", {
        body: { phase: "track" },
      });
      if (error) throw error;
      return typeof data === "string" ? JSON.parse(data) : data;
    },
    onSuccess: (data) => {
      toast.success(`트렌드 추적 완료: ${data?.track?.tracked ?? 0}건 추적`);
      queryClient.invalidateQueries({ queryKey: ["admin-trend-tracking"] });
    },
    onError: (err) => toast.error(`추적 실패: ${(err as Error).message}`),
  });

  // Run full pipeline
  const fullPipelineMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("ktrenz-trend-cron", {
        body: { phase: "detect", batchSize: 5, batchOffset: 0 },
      });
      if (error) throw error;
      return typeof data === "string" ? JSON.parse(data) : data;
    },
    onSuccess: () => {
      toast.success("전체 파이프라인 시작됨 (detect → track 자동 체이닝)");
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["admin-trend-triggers"] });
        queryClient.invalidateQueries({ queryKey: ["admin-trend-tracking"] });
      }, 30_000);
    },
    onError: (err) => toast.error(`파이프라인 실패: ${(err as Error).message}`),
  });

  // Expire single trigger
  const expireMutation = useMutation({
    mutationFn: async (triggerId: string) => {
      const { error } = await supabase
        .from("ktrenz_trend_triggers" as any)
        .update({ status: "expired", expired_at: new Date().toISOString() } as any)
        .eq("id", triggerId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("키워드 만료 처리 완료");
      queryClient.invalidateQueries({ queryKey: ["admin-trend-triggers"] });
    },
    onError: (err) => toast.error(`만료 처리 실패: ${(err as Error).message}`),
  });

  // Expire by artist name (bulk)
  const expireByArtistMutation = useMutation({
    mutationFn: async (artistName: string) => {
      const { error } = await supabase
        .from("ktrenz_trend_triggers" as any)
        .update({ status: "expired", expired_at: new Date().toISOString() } as any)
        .eq("artist_name", artistName)
        .eq("status", "active");
      if (error) throw error;
    },
    onSuccess: (_, artistName) => {
      toast.success(`"${artistName}"의 모든 활성 키워드 만료 처리 완료`);
      queryClient.invalidateQueries({ queryKey: ["admin-trend-triggers"] });
    },
    onError: (err) => toast.error(`일괄 만료 실패: ${(err as Error).message}`),
  });

  // Delete trigger permanently
  const deleteMutation = useMutation({
    mutationFn: async (triggerId: string) => {
      const { error } = await supabase
        .from("ktrenz_trend_triggers" as any)
        .delete()
        .eq("id", triggerId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("키워드 삭제 완료");
      queryClient.invalidateQueries({ queryKey: ["admin-trend-triggers"] });
    },
    onError: (err) => toast.error(`삭제 실패: ${(err as Error).message}`),
  });

  // Group tracking by trigger
  const trackingByTrigger = new Map<string, any[]>();
  for (const t of trackingData ?? []) {
    const key = t.trigger_id;
    if (!trackingByTrigger.has(key)) trackingByTrigger.set(key, []);
    trackingByTrigger.get(key)!.push(t);
  }

  const activeTriggers = (triggers ?? []).filter((t: any) => {
    if (t.status !== "active") return false;
    if (artistFilter && !t.artist_name?.toLowerCase().includes(artistFilter.toLowerCase())) return false;
    return true;
  });
  const expiredTriggers = (triggers ?? []).filter((t: any) => t.status === "expired");

  // Unique artist names in active triggers (for bulk expire)
  const activeArtistNames = [...new Set(activeTriggers.map((t: any) => t.artist_name as string))].sort();

  const isAnyRunning = detectMutation.isPending || trackMutation.isPending || fullPipelineMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">T2 트렌드 인텔리전스</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            K-pop 스타 파생 상업 트렌드 감지 및 추적
          </p>
        </div>
      </div>

      {/* Controls */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => fullPipelineMutation.mutate()}
            disabled={isAnyRunning}
            className="gap-1.5"
          >
            {fullPipelineMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            전체 파이프라인 실행
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => detectMutation.mutate()}
            disabled={isAnyRunning}
            className="gap-1.5"
          >
            {detectMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            키워드 감지만
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => trackMutation.mutate()}
            disabled={isAnyRunning}
            className="gap-1.5"
          >
            {trackMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TrendingUp className="w-3.5 h-3.5" />}
            검색량 추적만
          </Button>

          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">지역:</span>
            {REGIONS.map((r) => (
              <button
                key={r}
                onClick={() => setSelectedRegion(r)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors",
                  selectedRegion === r
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted text-muted-foreground border-border hover:bg-accent"
                )}
              >
                {r === "worldwide" ? "🌍 전체" : r}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="text-[11px] text-muted-foreground">활성 키워드</div>
          <div className="text-2xl font-bold text-foreground">{activeTriggers.length}</div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] text-muted-foreground">만료 키워드</div>
          <div className="text-2xl font-bold text-muted-foreground">{expiredTriggers.length}</div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] text-muted-foreground">추적 데이터</div>
          <div className="text-2xl font-bold text-foreground">{(trackingData ?? []).length}</div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] text-muted-foreground">아티스트 수</div>
          <div className="text-2xl font-bold text-foreground">
            {new Set((triggers ?? []).map((t: any) => t.wiki_entry_id)).size}
          </div>
        </Card>
      </div>

      {/* Active Triggers */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            활성 트렌드 키워드 ({activeTriggers.length})
          </h2>
        </div>

        {/* Filter + Bulk Actions */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="relative flex-1 min-w-[180px] max-w-[300px]">
            <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="아티스트명 필터..."
              value={artistFilter}
              onChange={(e) => setArtistFilter(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
          {artistFilter && activeArtistNames.length > 0 && (
            <Button
              size="sm"
              variant="destructive"
              className="gap-1 text-xs h-8"
              onClick={() => {
                if (confirm(`"${artistFilter}" 필터와 일치하는 ${activeTriggers.length}건의 키워드를 모두 만료 처리하시겠습니까?`)) {
                  // Expire all matching artists
                  const matchingNames = activeArtistNames.filter(n => n.toLowerCase().includes(artistFilter.toLowerCase()));
                  matchingNames.forEach(name => expireByArtistMutation.mutate(name));
                }
              }}
              disabled={expireByArtistMutation.isPending}
            >
              <XCircle className="w-3.5 h-3.5" />
              필터 결과 전체 만료 ({activeTriggers.length}건)
            </Button>
          )}
        </div>

        {triggersLoading ? (
          <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>
        ) : activeTriggers.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            {artistFilter ? "필터와 일치하는 키워드 없음" : "감지된 활성 키워드 없음. 파이프라인을 실행하세요."}
          </Card>
        ) : (
          <div className="space-y-2">
            {activeTriggers.map((trigger: any) => {
              const tracking = trackingByTrigger.get(trigger.id) ?? [];
              const regionTracking = tracking.filter((t: any) =>
                selectedRegion === "all" ? true : t.region === selectedRegion
              );
              const latestTrack = regionTracking[0];

              return (
                <Card key={trigger.id} className="p-3">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-foreground">{trigger.keyword}</span>
                        <Badge
                          variant="outline"
                          className={cn("text-[10px]", CATEGORY_COLORS[trigger.keyword_category] || "bg-muted")}
                        >
                          {trigger.keyword_category}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">
                          by <span className="font-medium text-foreground">{trigger.artist_name}</span>
                        </span>
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <Clock className="w-3 h-3" />
                          {formatAge(trigger.detected_at)}
                        </span>
                      </div>
                      {trigger.context && (
                        <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1">{trigger.context}</p>
                      )}
                      {/* Tracking data */}
                      {latestTrack && (
                        <div className="flex items-center gap-3 mt-2">
                          <div className="flex items-center gap-1">
                            <Globe className="w-3 h-3 text-muted-foreground" />
                            <span className="text-[11px] font-medium text-foreground">
                              관심도: {latestTrack.interest_score}
                            </span>
                          </div>
                          <div className="flex items-center gap-0.5">
                            {latestTrack.delta_pct > 0 ? (
                              <ArrowUpRight className="w-3 h-3 text-green-500" />
                            ) : latestTrack.delta_pct < 0 ? (
                              <ArrowDownRight className="w-3 h-3 text-red-500" />
                            ) : (
                              <Minus className="w-3 h-3 text-muted-foreground" />
                            )}
                            <span className={cn(
                              "text-[11px] font-medium",
                              latestTrack.delta_pct > 0 ? "text-green-500" :
                              latestTrack.delta_pct < 0 ? "text-red-500" : "text-muted-foreground"
                            )}>
                              {latestTrack.delta_pct > 0 ? "+" : ""}{latestTrack.delta_pct?.toFixed(1)}%
                            </span>
                          </div>
                          <span className="text-[10px] text-muted-foreground">
                            {formatAge(latestTrack.tracked_at)}
                          </span>
                        </div>
                      )}
                    </div>
                    <Badge
                      variant="outline"
                      className="text-[10px] bg-green-500/10 text-green-600 border-green-500/30 shrink-0"
                    >
                      활성
                    </Badge>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Expired Triggers */}
      {expiredTriggers.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-muted-foreground mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            만료 키워드 ({expiredTriggers.length})
          </h2>
          <div className="space-y-1">
            {expiredTriggers.slice(0, 20).map((trigger: any) => (
              <div key={trigger.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 border border-border/40">
                <span className="text-[11px] font-medium text-muted-foreground">{trigger.keyword}</span>
                <Badge variant="outline" className={cn("text-[9px]", CATEGORY_COLORS[trigger.keyword_category] || "")}>
                  {trigger.keyword_category}
                </Badge>
                <span className="text-[10px] text-muted-foreground ml-auto">{trigger.artist_name}</span>
                <span className="text-[10px] text-muted-foreground">{formatAge(trigger.detected_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminTrendIntel;
