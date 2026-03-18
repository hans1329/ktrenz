import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, ArrowUpRight, ArrowDownRight, Globe, Clock, Minus, ExternalLink, Newspaper, Trophy, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TrendTile } from "./T2TrendTreemap";

function getLocalizedKeyword(tile: TrendTile, lang: string): string {
  switch (lang) {
    case "ko": return tile.keywordKo || tile.keyword;
    case "ja": return tile.keywordJa || tile.keyword;
    case "zh": return tile.keywordZh || tile.keyword;
    default: return tile.keyword;
  }
}

const CATEGORY_COLORS: Record<string, string> = {
  brand: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  product: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  place: "bg-green-500/10 text-green-400 border-green-500/30",
  food: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  fashion: "bg-pink-500/10 text-pink-400 border-pink-500/30",
  beauty: "bg-rose-500/10 text-rose-400 border-rose-500/30",
  media: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
};

function formatAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const T2DetailSheet = ({ tile, onClose }: { tile: TrendTile | null; onClose: () => void }) => {
  const { language } = useLanguage();
  // Fetch tracking history for this trigger
  const { data: tracking } = useQuery({
    queryKey: ["t2-tracking-detail", tile?.id],
    queryFn: async () => {
      if (!tile) return [];
      const { data } = await supabase
        .from("ktrenz_trend_tracking" as any)
        .select("*")
        .eq("trigger_id", tile.id)
        .order("tracked_at", { ascending: false })
        .limit(20);
      return (data ?? []) as any[];
    },
    enabled: !!tile,
  });

  if (!tile) return null;

  return (
    <Sheet open={!!tile} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[70dvh] overflow-y-auto border-border">
        <SheetHeader className="pb-3">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="w-5 h-5 text-primary" />
            {getLocalizedKeyword(tile, language)}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-4">
          {/* Meta */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn("text-[11px]", CATEGORY_COLORS[tile.category] || "")}>
              {tile.category}
            </Badge>
            <span className="text-sm text-muted-foreground">
              by <span className="font-medium text-foreground">{tile.artistName}</span>
            </span>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatAge(tile.detectedAt)}
            </span>
          </div>

          {/* Context */}
          {tile.context && (
            <p className="text-sm text-muted-foreground leading-relaxed">{tile.context}</p>
          )}

          {/* Influence metrics */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-muted/30 border border-border p-3">
              <div className="text-[11px] text-muted-foreground mb-1">Influence</div>
              <div className="text-xl font-bold text-foreground">
                {tile.influenceIndex > 0 ? `+${tile.influenceIndex.toFixed(1)}%` : "—"}
              </div>
            </div>
            <div className="rounded-lg bg-muted/30 border border-border p-3">
              <div className="text-[11px] text-muted-foreground mb-1">Baseline</div>
              <div className="text-xl font-bold text-foreground">
                {tile.baselineScore != null ? tile.baselineScore : "—"}
              </div>
            </div>
            <div className="rounded-lg bg-muted/30 border border-border p-3">
              <div className="text-[11px] text-muted-foreground mb-1">Peak</div>
              <div className="text-xl font-bold text-foreground">
                {tile.peakScore != null ? tile.peakScore : "—"}
              </div>
            </div>
          </div>

          {/* Tracking history */}
          {tracking && tracking.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-foreground mb-2 flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-muted-foreground" />
                Tracking History
              </h3>
              <div className="space-y-1.5">
                {tracking.map((t: any) => (
                  <div key={t.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/20 border border-border/40">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground w-8">{t.region}</span>
                      <span className="text-sm font-bold text-foreground">
                        {t.interest_score}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-0.5">
                        {(t.delta_pct ?? 0) > 0 ? (
                          <ArrowUpRight className="w-3 h-3 text-green-500" />
                        ) : (t.delta_pct ?? 0) < 0 ? (
                          <ArrowDownRight className="w-3 h-3 text-red-500" />
                        ) : (
                          <Minus className="w-3 h-3 text-muted-foreground" />
                        )}
                        <span className={cn(
                          "text-xs font-medium",
                          (t.delta_pct ?? 0) > 0 ? "text-green-500" :
                          (t.delta_pct ?? 0) < 0 ? "text-red-500" : "text-muted-foreground"
                        )}>
                          {(t.delta_pct ?? 0) > 0 ? "+" : ""}{(t.delta_pct ?? 0).toFixed(1)}%
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {formatAge(t.tracked_at)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default T2DetailSheet;
