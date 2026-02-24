import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Home, Crosshair, RefreshCw, TrendingUp, TrendingDown, Minus, Music2, BarChart3, Target, Clock, Loader2, Zap, AlertCircle } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface V3StreamingGuideProps {
  onBack?: () => void;
}

const GUIDE_URL = `https://jguylowswwgjvotdcsfj.supabase.co/functions/v1/ktrenz-streaming-guide`;

const MomentumBadge = ({ momentum }: { momentum: string }) => {
  const config = {
    rising: { icon: TrendingUp, label: "Rising", className: "bg-green-500/10 text-green-400 border-green-500/20" },
    stable: { icon: Minus, label: "Stable", className: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
    declining: { icon: TrendingDown, label: "Declining", className: "bg-red-500/10 text-red-400 border-red-500/20" },
  }[momentum] ?? { icon: Minus, label: momentum, className: "bg-muted text-muted-foreground border-border" };

  const Icon = config.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border", config.className)}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
};

const FanPowerBadge = ({ tier }: { tier: string }) => {
  const config: Record<string, { label: string; className: string }> = {
    mega: { label: "MEGA", className: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
    strong: { label: "STRONG", className: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
    growing: { label: "GROWING", className: "bg-green-500/10 text-green-400 border-green-500/20" },
    emerging: { label: "EMERGING", className: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  };
  const c = config[tier] ?? { label: tier, className: "bg-muted text-muted-foreground border-border" };
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider border", c.className)}>
      <Zap className="w-2.5 h-2.5" />
      {c.label}
    </span>
  );
};

const PriorityDot = ({ priority }: { priority: string }) => {
  const colors = { high: "bg-red-400", medium: "bg-yellow-400", low: "bg-green-400" };
  return <span className={cn("w-2 h-2 rounded-full shrink-0", colors[priority as keyof typeof colors] ?? "bg-muted-foreground")} />;
};

const V3StreamingGuide = ({ onBack }: V3StreamingGuideProps) => {
  const navigate = useNavigate();
  const { user, session } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["ktrenz-streaming-guide", user?.id],
    queryFn: async () => {
      if (!session?.access_token) throw new Error("Not authenticated");
      const resp = await fetch(GUIDE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({}),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Failed to load guide");
      }
      return resp.json();
    },
    enabled: !!user?.id && !!session?.access_token,
    staleTime: 1000 * 60 * 30,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Delete cached guides first
      if (user?.id) {
        await supabase
          .from("ktrenz_streaming_guides")
          .delete()
          .eq("user_id", user.id);
      }
      await refetch();
      toast.success("Guide refreshed");
    } catch {
      toast.error("Failed to refresh guide");
    } finally {
      setIsRefreshing(false);
    }
  };

  const guides = data?.guides ?? [];

  // ── Header ──
  const renderHeader = () => (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50 pt-[env(safe-area-inset-top)]">
      <div className="flex items-center justify-between h-14 px-4 max-w-screen-lg mx-auto">
        <div className="flex items-center gap-1 min-w-[72px]">
          <Button variant="ghost" size="icon" className="rounded-full w-9 h-9" onClick={() => (onBack ? onBack() : navigate(-1))}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <Link to="/">
            <Button variant="ghost" size="icon" className="rounded-full w-9 h-9">
              <Home className="w-4 h-4" />
            </Button>
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <Crosshair className="w-4 h-4 text-primary" />
          <h1 className="text-base font-bold text-foreground">Streaming Guide</h1>
        </div>
        <div className="min-w-[72px] flex justify-end">
          <Button variant="ghost" size="icon" className="rounded-full w-9 h-9" onClick={handleRefresh} disabled={isRefreshing || isLoading}>
            <RefreshCw className={cn("w-4 h-4", (isRefreshing || isLoading) && "animate-spin")} />
          </Button>
        </div>
      </div>
    </header>
  );

  // ── Not signed in ──
  if (!user) {
    return (
      <div className="flex flex-col h-full">
        {renderHeader()}
        <div className="px-4 py-12 text-center space-y-4">
          <Crosshair className="w-12 h-12 mx-auto text-primary/30" />
          <p className="text-lg font-semibold text-foreground">Sign In Required</p>
          <p className="text-sm text-muted-foreground">Please sign in to receive personalized streaming guides</p>
        </div>
      </div>
    );
  }

  // ── Loading ──
  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        {renderHeader()}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
            <p className="text-sm text-muted-foreground">Analyzing data...</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Empty ──
  if (guides.length === 0) {
    return (
      <div className="flex flex-col h-full">
        {renderHeader()}
        <div className="px-4 py-12 text-center space-y-4">
          <Crosshair className="w-12 h-12 mx-auto text-primary/30" />
          <p className="text-lg font-semibold text-foreground">Register Your Artists</p>
          <p className="text-sm text-muted-foreground">
            Add artists in Fan Agent<br />to get personalized streaming strategies
          </p>
          <Button variant="outline" className="rounded-full" onClick={() => onBack ? onBack() : navigate("/agent")}>
            Go to Fan Agent
          </Button>
        </div>
      </div>
    );
  }

  // ── Guide Cards ──
  return (
    <div className="flex flex-col h-full">
      {renderHeader()}
      <div className="flex-1 overflow-auto px-4 py-4 space-y-4">
        {guides.map((guide: any, idx: number) => {
          const g = guide.guide_data ?? guide;
          if (g.error) return null;

          return (
            <div key={idx} className="rounded-2xl border border-border/50 bg-card overflow-hidden">
              {/* Artist header */}
              <div className="p-4 border-b border-border/30 bg-gradient-to-r from-primary/5 to-transparent">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-foreground">{g.artist_name ?? guide.artist_name}</h2>
                    <div className="flex items-center gap-2 mt-1">
                      {g.current_rank && (
                        <span className="text-xs text-muted-foreground">#{g.current_rank}</span>
                      )}
                      {g.momentum && <MomentumBadge momentum={g.momentum} />}
                      {g.sales_analysis?.fan_power_tier && <FanPowerBadge tier={g.sales_analysis.fan_power_tier} />}
                    </div>
                  </div>
                  <div className="text-right">
                    {g.gap_analysis?.target_rank && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Target className="w-3 h-3" />
                        Target #{g.gap_analysis.target_rank}
                      </div>
                    )}
                  </div>
                </div>
                {g.momentum_detail && (
                  <p className="text-xs text-muted-foreground mt-2">{g.momentum_detail}</p>
                )}
              </div>

              {/* Platform Focus */}
              {g.platform_focus?.length > 0 && (
                <div className="p-4 border-b border-border/30">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <BarChart3 className="w-3 h-3" />
                    Platform Strategy
                  </h3>
                  <div className="space-y-2">
                    {g.platform_focus.map((pf: any, i: number) => (
                      <div key={i} className="flex items-start gap-2">
                        <PriorityDot priority={pf.priority} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium text-foreground capitalize">{pf.platform}</span>
                            <span className="text-[10px] text-muted-foreground/60 uppercase">{pf.priority}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{pf.action}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sales Analysis */}
              {g.sales_analysis?.latest_album && (
                <div className="p-4 border-b border-border/30">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Music2 className="w-3 h-3" />
                    Album Sales Analysis
                  </h3>
                  <div className="bg-muted/30 rounded-xl p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">{g.sales_analysis.latest_album}</span>
                      {g.sales_analysis.first_week_sales > 0 && (
                        <span className="text-sm font-bold text-primary">
                          {g.sales_analysis.first_week_sales.toLocaleString()} copies
                        </span>
                      )}
                    </div>
                    {g.sales_analysis.assessment && (
                      <p className="text-xs text-muted-foreground mt-1">{g.sales_analysis.assessment}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Gap Analysis */}
              {g.gap_analysis?.key_deficit && (
                <div className="p-4 border-b border-border/30">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Target className="w-3 h-3" />
                    Gap Analysis
                  </h3>
                  <div className="bg-muted/30 rounded-xl p-3">
                    {g.gap_analysis.energy_gap != null && (
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">Energy Gap</span>
                        <span className="text-sm font-bold text-foreground">{Math.round(g.gap_analysis.energy_gap)}</span>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">{g.gap_analysis.key_deficit}</p>
                  </div>
                </div>
              )}

              {/* Action Items */}
              {g.action_items?.length > 0 && (
                <div className="p-4 border-b border-border/30">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Crosshair className="w-3 h-3" />
                    Action Items
                  </h3>
                  <div className="space-y-1.5">
                    {g.action_items.map((item: string, i: number) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <p className="text-sm text-foreground leading-snug">{item}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Timing Tip */}
              {g.timing_tip && (
                <div className="p-4">
                  <div className="flex items-start gap-2 bg-primary/5 rounded-xl p-3 border border-primary/10">
                    <Clock className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <p className="text-xs text-foreground leading-relaxed">{g.timing_tip}</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default V3StreamingGuide;
