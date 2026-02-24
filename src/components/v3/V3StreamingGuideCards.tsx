import { TrendingUp, TrendingDown, Minus, Music2, BarChart3, Target, Clock, Zap, Crosshair } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Badge Components ──

const MomentumBadge = ({ momentum }: { momentum: string }) => {
  const config = {
    rising: { icon: TrendingUp, label: "상승세", className: "bg-green-500/10 text-green-400 border-green-500/20" },
    stable: { icon: Minus, label: "유지", className: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
    declining: { icon: TrendingDown, label: "하락세", className: "bg-red-500/10 text-red-400 border-red-500/20" },
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

// ── Main Cards Component ──

interface StreamingGuideCardsProps {
  guides: any[];
}

const V3StreamingGuideCards = ({ guides }: StreamingGuideCardsProps) => {
  if (!guides || guides.length === 0) return null;

  return (
    <div className="space-y-3 mt-2">
      {guides.map((guide: any, idx: number) => {
        const g = guide.guide_data ?? guide;
        if (g.error) return null;

        return (
          <div key={idx} className="rounded-xl border border-border/50 bg-card/80 overflow-hidden text-sm">
            {/* Artist header */}
            <div className="p-3 border-b border-border/30 bg-gradient-to-r from-primary/5 to-transparent">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-foreground">{g.artist_name ?? guide.artist_name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    {g.current_rank && <span className="text-xs text-muted-foreground">#{g.current_rank}</span>}
                    {g.momentum && <MomentumBadge momentum={g.momentum} />}
                    {g.sales_analysis?.fan_power_tier && <FanPowerBadge tier={g.sales_analysis.fan_power_tier} />}
                  </div>
                </div>
                {g.gap_analysis?.target_rank && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Target className="w-3 h-3" />
                    목표 #{g.gap_analysis.target_rank}
                  </div>
                )}
              </div>
              {g.momentum_detail && <p className="text-xs text-muted-foreground mt-1.5">{g.momentum_detail}</p>}
            </div>

            {/* Platform Focus */}
            {g.platform_focus?.length > 0 && (
              <div className="p-3 border-b border-border/30">
                <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <BarChart3 className="w-3 h-3" />
                  플랫폼별 전략
                </h4>
                <div className="space-y-1.5">
                  {g.platform_focus.map((pf: any, i: number) => (
                    <div key={i} className="flex items-start gap-2">
                      <PriorityDot priority={pf.priority} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-foreground capitalize">{pf.platform}</span>
                          <span className="text-[10px] text-muted-foreground/60 uppercase">{pf.priority}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{pf.action}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sales Analysis */}
            {g.sales_analysis?.latest_album && (
              <div className="p-3 border-b border-border/30">
                <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Music2 className="w-3 h-3" />
                  앨범 판매 분석
                </h4>
                <div className="bg-muted/30 rounded-lg p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground">{g.sales_analysis.latest_album}</span>
                    {g.sales_analysis.first_week_sales > 0 && (
                      <span className="text-xs font-bold text-primary">{g.sales_analysis.first_week_sales.toLocaleString()}장</span>
                    )}
                  </div>
                  {g.sales_analysis.assessment && <p className="text-[11px] text-muted-foreground mt-1">{g.sales_analysis.assessment}</p>}
                </div>
              </div>
            )}

            {/* Gap Analysis */}
            {g.gap_analysis?.key_deficit && (
              <div className="p-3 border-b border-border/30">
                <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Target className="w-3 h-3" />
                  갭 분석
                </h4>
                <div className="bg-muted/30 rounded-lg p-2.5">
                  {g.gap_analysis.energy_gap != null && (
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] text-muted-foreground">Energy 격차</span>
                      <span className="text-xs font-bold text-foreground">{Math.round(g.gap_analysis.energy_gap)}</span>
                    </div>
                  )}
                  <p className="text-[11px] text-muted-foreground">{g.gap_analysis.key_deficit}</p>
                </div>
              </div>
            )}

            {/* Action Items */}
            {g.action_items?.length > 0 && (
              <div className="p-3 border-b border-border/30">
                <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Crosshair className="w-3 h-3" />
                  실행 좌표
                </h4>
                <div className="space-y-1">
                  {g.action_items.map((item: string, i: number) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-primary/10 text-primary text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <p className="text-xs text-foreground leading-snug">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Timing Tip */}
            {g.timing_tip && (
              <div className="p-3">
                <div className="flex items-start gap-2 bg-primary/5 rounded-lg p-2.5 border border-primary/10">
                  <Clock className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                  <p className="text-[11px] text-foreground leading-relaxed">{g.timing_tip}</p>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default V3StreamingGuideCards;
