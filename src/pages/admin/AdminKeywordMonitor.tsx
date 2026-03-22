import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, TrendingUp, TrendingDown, AlertTriangle, Clock, Flame, Minus, RefreshCw, Search, Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, differenceInHours } from "date-fns";
import { useState, useMemo, useCallback } from "react";
import { toast } from "sonner";

interface TrendTrigger {
  id: string;
  artist_name: string;
  keyword: string;
  keyword_ko: string | null;
  keyword_en: string | null;
  keyword_category: string;
  influence_index: number;
  baseline_score: number;
  peak_score: number;
  peak_at: string | null;
  detected_at: string;
  status: string;
  expired_at: string | null;
  lifetime_hours: number;
  star_id: string | null;
  metadata: any;
}

type Zone = "rising" | "peaked" | "declining" | "at_risk" | "stable";

function classifyKeyword(t: TrendTrigger): Zone {
  const hoursAlive = differenceInHours(new Date(), new Date(t.detected_at));
  const ratio = t.peak_score > 0 ? t.baseline_score / t.peak_score : 1;
  const hoursSincePeak = t.peak_at ? differenceInHours(new Date(), new Date(t.peak_at)) : hoursAlive;

  // Rising: baseline still climbing or recently detected with high influence
  if (hoursSincePeak < 6 && ratio >= 0.8 && t.influence_index >= 50) return "rising";
  // At risk: alive > 48h and baseline dropped significantly from peak
  if (hoursAlive > 48 && ratio < 0.3) return "at_risk";
  // Declining: past peak and dropping
  if (hoursSincePeak > 12 && ratio < 0.6) return "declining";
  // Peaked: near peak but starting to level off
  if (hoursSincePeak > 6 && ratio >= 0.6) return "peaked";
  // Stable
  return "stable";
}

const ZONE_CONFIG: Record<Zone, { label: string; icon: React.ElementType; color: string; bgColor: string }> = {
  rising: { label: "🚀 급상승", icon: TrendingUp, color: "text-green-400", bgColor: "bg-green-500/10 border-green-500/20" },
  peaked: { label: "⚡ 피크 근처", icon: Flame, color: "text-yellow-400", bgColor: "bg-yellow-500/10 border-yellow-500/20" },
  stable: { label: "➖ 안정", icon: Minus, color: "text-blue-400", bgColor: "bg-blue-500/10 border-blue-500/20" },
  declining: { label: "📉 하락세", icon: TrendingDown, color: "text-orange-400", bgColor: "bg-orange-500/10 border-orange-500/20" },
  at_risk: { label: "⚠️ 탈락 위기", icon: AlertTriangle, color: "text-red-400", bgColor: "bg-red-500/10 border-red-500/20" },
};

const ZONE_ORDER: Zone[] = ["rising", "peaked", "stable", "declining", "at_risk"];

const CATEGORY_COLORS: Record<string, string> = {
  music: "bg-purple-500/20 text-purple-300",
  event: "bg-blue-500/20 text-blue-300",
  brand: "bg-emerald-500/20 text-emerald-300",
  social: "bg-pink-500/20 text-pink-300",
  product: "bg-amber-500/20 text-amber-300",
  collab: "bg-cyan-500/20 text-cyan-300",
  media: "bg-indigo-500/20 text-indigo-300",
  award: "bg-yellow-500/20 text-yellow-300",
};

const AdminKeywordMonitor = () => {
  const { isAdmin, loading } = useAdminAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [filterZone, setFilterZone] = useState<Zone | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [zoneSortDir, setZoneSortDir] = useState<Record<Zone, "desc" | "asc">>({
    rising: "desc", peaked: "desc", stable: "desc", declining: "desc", at_risk: "desc",
  });

  const { data: triggers, isLoading, refetch } = useQuery({
    queryKey: ["admin-keyword-monitor"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("ktrenz_trend_triggers")
        .select("id, artist_name, keyword, keyword_ko, keyword_en, keyword_category, influence_index, baseline_score, peak_score, peak_at, detected_at, status, expired_at, lifetime_hours, star_id, metadata")
        .eq("status", "active")
        .order("influence_index", { ascending: false });
      return (data ?? []) as TrendTrigger[];
    },
    refetchInterval: 30000,
  });

  const classified = useMemo(() => (triggers ?? []).map(t => ({ ...t, zone: classifyKeyword(t) })), [triggers]);

  // Top 60 non-goods keywords by influence = visible on treemap
  const visibleIds = useMemo(() => {
    const sorted = [...classified]
      .filter(t => t.keyword_category !== "goods")
      .sort((a, b) => b.influence_index - a.influence_index)
      .slice(0, 60);
    return new Set(sorted.map(t => t.id));
  }, [classified]);

  const zoneCounts = useMemo(() => {
    const counts: Record<Zone, number> = { rising: 0, peaked: 0, stable: 0, declining: 0, at_risk: 0 };
    classified.forEach(t => counts[t.zone]++);
    return counts;
  }, [classified]);

  const groupedByZone = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let base = filterZone === "all" ? classified : classified.filter(t => t.zone === filterZone);
    if (q) {
      base = base.filter(t =>
        (t.keyword?.toLowerCase().includes(q)) ||
        (t.keyword_ko?.toLowerCase().includes(q)) ||
        (t.keyword_en?.toLowerCase().includes(q)) ||
        (t.artist_name?.toLowerCase().includes(q))
      );
    }
    return ZONE_ORDER.reduce((acc, zone) => {
      const items = base.filter(t => t.zone === zone);
      const dir = zoneSortDir[zone];
      items.sort((a, b) => dir === "desc" ? b.influence_index - a.influence_index : a.influence_index - b.influence_index);
      acc[zone] = items;
      return acc;
    }, {} as Record<Zone, typeof classified>);
  }, [classified, filterZone, zoneSortDir, searchQuery]);

  const handleRemove = useCallback(async (id: string, label: string) => {
    try {
      const { error } = await supabase.functions.invoke("admin-update-field", {
        body: { table: "ktrenz_trend_triggers", match: { id }, update: { status: "removed" } },
      });
      if (error) throw error;
      toast.success(`"${label}" 제거 완료`);
      queryClient.invalidateQueries({ queryKey: ["admin-keyword-monitor"] });
    } catch (e: any) {
      toast.error(`제거 실패: ${e.message}`);
    }
  }, [queryClient]);

  if (loading) return <div className="p-8 text-center text-muted-foreground">로딩 중...</div>;
  if (!isAdmin) { navigate("/admin/login"); return null; }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="flex items-center gap-3 max-w-5xl mx-auto">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">키워드 모니터</h1>
            <p className="text-xs text-muted-foreground">
              전체 활성 키워드 {triggers?.length ?? 0}개
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1">
            <RefreshCw className="w-3 h-3" />
            새로고침
          </Button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-4 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="키워드 / 아티스트 검색..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-muted/30 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>

        {/* Zone summary chips */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilterZone("all")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              filterZone === "all" ? "bg-foreground text-background border-foreground" : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
            }`}
          >
            전체 ({triggers?.length ?? 0})
          </button>
          {ZONE_ORDER.map(zone => {
            const cfg = ZONE_CONFIG[zone];
            return (
              <button
                key={zone}
                onClick={() => setFilterZone(zone)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  filterZone === zone ? "bg-foreground text-background border-foreground" : `${cfg.bgColor} ${cfg.color} hover:opacity-80`
                }`}
              >
                {cfg.label} ({zoneCounts[zone]})
              </button>
            );
          })}
        </div>

        {isLoading ? (
          <div className="text-center text-muted-foreground py-12">데이터 로딩 중...</div>
        ) : (
          <>
            {ZONE_ORDER.map(zone => {
              const items = groupedByZone[zone];
              if (!items || items.length === 0) return null;
              const cfg = ZONE_CONFIG[zone];
              const Icon = cfg.icon;

              return (
                <div key={zone} className={`rounded-xl border p-4 ${cfg.bgColor}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <Icon className={`w-4 h-4 ${cfg.color}`} />
                    <h2 className={`text-sm font-bold ${cfg.color}`}>{cfg.label}</h2>
                    <span className="text-xs text-muted-foreground">({items.length})</span>
                    <button
                      onClick={() => setZoneSortDir(prev => ({ ...prev, [zone]: prev[zone] === "desc" ? "asc" : "desc" }))}
                      className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-background/50 hover:bg-background/80 transition-colors text-muted-foreground"
                    >
                      {zoneSortDir[zone] === "desc" ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                      {zoneSortDir[zone] === "desc" ? "높은순" : "낮은순"}
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {items.map(t => {
                      const hoursAlive = differenceInHours(new Date(), new Date(t.detected_at));
                      const ratio = t.peak_score > 0 ? (t.baseline_score / t.peak_score * 100).toFixed(0) : "–";
                      return (
                        <div
                          key={t.id}
                          onClick={() => navigate(`/t2/${t.id}`)}
                          className="flex items-center gap-3 px-3 py-2 rounded-lg bg-background/60 hover:bg-background/80 cursor-pointer transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate">
                                {t.keyword_ko || t.keyword}
                              </span>
                              {visibleIds.has(t.id) && (
                                <Badge className="text-[9px] px-1.5 py-0 h-4 bg-primary/20 text-primary border-primary/30 gap-0.5">
                                  <Eye className="w-2.5 h-2.5" />
                                  노출
                                </Badge>
                              )}
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${CATEGORY_COLORS[t.keyword_category] ?? "bg-muted text-muted-foreground"}`}>
                                {t.keyword_category}
                              </Badge>
                            </div>
                            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                              {t.artist_name}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 text-right shrink-0">
                            <div>
                              <p className="text-xs font-mono font-bold">{Number(t.influence_index).toFixed(0)}</p>
                              <p className="text-[10px] text-muted-foreground">영향력</p>
                            </div>
                            <div>
                              <p className="text-xs font-mono">{ratio}%</p>
                              <p className="text-[10px] text-muted-foreground">피크비</p>
                            </div>
                            <div className="flex items-center gap-0.5">
                              <Clock className="w-3 h-3 text-muted-foreground" />
                              <span className="text-[10px] text-muted-foreground">{hoursAlive}h</span>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!confirm(`"${t.keyword_ko || t.keyword}" 키워드를 제거할까요?`)) return;
                                handleRemove(t.id, t.keyword_ko || t.keyword);
                              }}
                              className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                              title="제거"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
};

export default AdminKeywordMonitor;
