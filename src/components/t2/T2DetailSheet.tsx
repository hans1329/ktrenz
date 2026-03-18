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

const T2_LABELS: Record<string, Record<string, string>> = {
  whyTrend: { en: "Why this trend?", ko: "왜 이 트렌드인가?", ja: "なぜこのトレンド？", zh: "为什么是这个趋势？" },
  noContext: { en: "No context available yet.", ko: "아직 맥락 정보가 없습니다.", ja: "コンテキスト情報はまだありません。", zh: "尚无相关信息。" },
  whyRank: { en: "Why", ko: "왜", ja: "なぜ", zh: "为什么" },
  whyRankSuffix: { en: "?", ko: "위인가?", ja: "位？", zh: "位？" },
  surged: { en: "Google Trends search volume surged", ko: "Google Trends 검색량이", ja: "Google Trendsの検索量が", zh: "Google Trends搜索量" },
  surgedAfter: { en: "after", ko: "이후", ja: "のニュース後", zh: "新闻后" },
  newsMention: { en: "'s news mention.", ko: "의 뉴스 언급 이후 급등.", ja: "に急増。", zh: "急增。" },
  baselineWas: { en: "Baseline interest was", ko: "기본 관심도", ja: "ベースライン関心度", zh: "基础关注度" },
  peakedAt: { en: ", peaked at", ko: ", 최고", ja: ", ピーク", zh: ", 峰值" },
  highestAmong: { en: "This is the highest influence index among", ko: "이것은", ja: "これは", zh: "这是" },
  activeKeywords: { en: "active keywords.", ko: "개 활성 키워드 중 가장 높은 영향력 지수입니다.", ja: "件のアクティブキーワードの中で最高の影響力指数です。", zh: "个活跃关键词中最高的影响力指数。" },
  trackingStarted: { en: "Tracking just started — waiting for Google Trends data to calculate influence.", ko: "추적이 시작되었습니다 — 영향력 산출을 위해 Google Trends 데이터를 기다리고 있습니다.", ja: "トラッキングが開始されました — 影響力算出のためGoogle Trendsデータを待っています。", zh: "追踪刚开始 — 等待Google Trends数据计算影响力。" },
  influence: { en: "Influence", ko: "영향력", ja: "影響力", zh: "影响力" },
  baseline: { en: "Baseline", ko: "기본값", ja: "ベースライン", zh: "基准" },
  peak: { en: "Peak", ko: "최고값", ja: "ピーク", zh: "峰值" },
  trackingHistory: { en: "Tracking History", ko: "추적 기록", ja: "トラッキング履歴", zh: "追踪记录" },
  by: { en: "by", ko: "by", ja: "by", zh: "by" },
};

function t(key: string, lang: string): string {
  return T2_LABELS[key]?.[lang] || T2_LABELS[key]?.en || key;
}

function formatAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const T2DetailSheet = ({ tile, rank, totalCount, onClose }: { tile: TrendTile | null; rank?: number; totalCount?: number; onClose: () => void }) => {
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
            {rank != null && (
              <Badge className="bg-primary/10 text-primary border-primary/30 text-[11px] font-black">
                <Trophy className="w-3 h-3 mr-0.5" />
                #{rank}
              </Badge>
            )}
            <Badge variant="outline" className={cn("text-[11px]", CATEGORY_COLORS[tile.category] || "")}>
              {tile.category}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {t("by", language)} <span className="font-medium text-foreground">{tile.artistName}</span>
            </span>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatAge(tile.detectedAt)}
            </span>
          </div>

          {/* Evidence: Why this trend? */}
          <div className="rounded-xl bg-muted/30 border border-border p-3 space-y-2">
            <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Newspaper className="w-3.5 h-3.5 text-primary" />
              {t("whyTrend", language)}
            </h3>
            {tile.context ? (
              <p className="text-sm text-muted-foreground leading-relaxed">
                {tile.context}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground italic">{t("noContext", language)}</p>
            )}
            {tile.sourceTitle && (
              <div className="flex items-start gap-2 pt-1 border-t border-border/50">
                <ExternalLink className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
                {tile.sourceUrl ? (
                  <a
                    href={tile.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline line-clamp-2"
                  >
                    {tile.sourceTitle}
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground line-clamp-2">{tile.sourceTitle}</span>
                )}
              </div>
            )}
          </div>

          {/* Ranking explanation: Why this rank? */}
          {rank != null && (
            <div className="rounded-xl bg-muted/30 border border-border p-3 space-y-2">
              <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-primary" />
                {t("whyRank", language)} #{rank}{t("whyRankSuffix", language)}
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {tile.influenceIndex > 0 ? (
                  <>
                    {t("surged", language)} <span className="font-bold text-foreground">+{tile.influenceIndex.toFixed(1)}%</span> {t("surgedAfter", language)} {tile.artistName}{t("newsMention", language)}
                    {tile.baselineScore != null && tile.peakScore != null && (
                      <> {t("baselineWas", language)} <span className="font-bold text-foreground">{tile.baselineScore}</span>{t("peakedAt", language)} <span className="font-bold text-foreground">{tile.peakScore}</span>.</>
                    )}
                    {totalCount && totalCount > 1 && (
                      <> {t("highestAmong", language)} {totalCount} {t("activeKeywords", language)}</>
                    )}
                  </>
                ) : (
                  <>{t("trackingStarted", language)}</>
                )}
              </p>
            </div>
          )}

          {/* Influence metrics */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-muted/30 border border-border p-3">
              <div className="text-[11px] text-muted-foreground mb-1">{t("influence", language)}</div>
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
