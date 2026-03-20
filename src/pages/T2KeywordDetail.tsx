import { useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useIsMobile } from "@/hooks/use-mobile";
import SEO from "@/components/SEO";
import { useAuth } from "@/hooks/useAuth";
import { useTrackEvent } from "@/hooks/useTrackEvent";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  TrendingUp, ArrowUpRight, ArrowDownRight, Minus, Globe, Clock,
  ExternalLink, Newspaper, Trophy, Info, Timer, Zap, ChevronLeft,
  BarChart3, Target, Activity, Calendar, Building2, Sparkles, Users,
  Flag,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart } from "recharts";

// ── Helpers ──
function getLocalizedKeyword(tile: any, lang: string): string {
  switch (lang) {
    case "ko": return tile.keywordKo || tile.keyword_ko || tile.keyword;
    case "ja": return tile.keywordJa || tile.keyword_ja || tile.keyword;
    case "zh": return tile.keywordZh || tile.keyword_zh || tile.keyword;
    default: return tile.keyword;
  }
}

function getLocalizedContext(tile: any, lang: string): string | null {
  switch (lang) {
    case "ko": return tile.contextKo || tile.context_ko || tile.context;
    case "ja": return tile.contextJa || tile.context_ja || tile.context;
    case "zh": return tile.contextZh || tile.context_zh || tile.context;
    default: return tile.context;
  }
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " +
    d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
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

const CATEGORY_LABELS: Record<string, string> = {
  brand: "Brand", product: "Product", place: "Place", food: "Food",
  fashion: "Fashion", beauty: "Beauty", media: "Media",
};

// Strip citation refs like [1], [2], [3] etc from text
function stripCitations(text: string | null): string | null {
  if (!text) return text;
  return text.replace(/\s*\[\d+\]/g, "").trim();
}

// i18n translations for this page
const T2_LABELS: Record<string, Record<string, string>> = {
  kinterestScore: { en: "Kinterest Score", ko: "Kinterest 스코어", ja: "Kinterestスコア", zh: "Kinterest 评分" },
  whyThisTrend: { en: "Why this trend?", ko: "왜 이 트렌드인가?", ja: "なぜこのトレンド？", zh: "为什么是这个趋势？" },
  noContext: { en: "No context available yet.", ko: "아직 배경 정보가 없습니다.", ja: "まだ背景情報がありません。", zh: "暂无背景信息。" },
  confidence: { en: "Confidence", ko: "신뢰도", ja: "信頼度", zh: "置信度" },
  keywordLifecycle: { en: "Keyword Lifecycle", ko: "키워드 라이프사이클", ja: "キーワードライフサイクル", zh: "关键词生命周期" },
  lifetime: { en: "Lifetime", ko: "지속 시간", ja: "持続時間", zh: "持续时间" },
  elapsed: { en: "Elapsed", ko: "경과", ja: "経過", zh: "经过" },
  timeToPeak: { en: "Time to Peak", ko: "피크까지", ja: "ピークまで", zh: "峰值时间" },
  detected: { en: "Detected", ko: "감지", ja: "検出", zh: "检测" },
  peakTime: { en: "Peak Time", ko: "피크 시간", ja: "ピーク時間", zh: "峰值时间" },
  notPeakedYet: { en: "Not peaked yet", ko: "아직 미도달", ja: "未到達", zh: "尚未达到峰值" },
  agencyInsight: { en: "Agency Insight", ko: "에이전시 인사이트", ja: "エージェンシー分析", zh: "代理商洞察" },
  commercialPotential: { en: "Commercial Potential", ko: "상업적 잠재력", ja: "商業的潜在力", zh: "商业潜力" },
  reactionSpeed: { en: "Reaction Speed", ko: "반응 속도", ja: "反応速度", zh: "反应速度" },
  detectionSource: { en: "Detection Source", ko: "감지 소스", ja: "検出ソース", zh: "检测来源" },
  trackingHistory: { en: "Tracking History", ko: "추적 기록", ja: "追跡履歴", zh: "追踪记录" },
  records: { en: "records", ko: "건", ja: "件", zh: "条" },
  otherKeywords: { en: "Other Keywords by", ko: "의 다른 키워드", ja: "の他のキーワード", zh: "的其他关键词" },
  high: { en: "High", ko: "높음", ja: "高い", zh: "高" },
  medium: { en: "Medium", ko: "보통", ja: "中程度", zh: "中" },
  low: { en: "Low", ko: "낮음", ja: "低い", zh: "低" },
  tracking: { en: "Tracking", ko: "추적 중", ja: "追跡中", zh: "追踪中" },
  pending: { en: "Pending", ko: "대기 중", ja: "保留中", zh: "待定" },
  trendMap: { en: "Trend Map", ko: "트렌드 맵", ja: "トレンドマップ", zh: "趋势地图" },
  active: { en: "Active", ko: "활성", ja: "アクティブ", zh: "活跃" },
  expired: { en: "Expired", ko: "만료", ja: "期限切れ", zh: "已过期" },
  influence: { en: "Influence", ko: "영향력", ja: "影響力", zh: "影响力" },
  baseline: { en: "Baseline", ko: "기준", ja: "基準", zh: "基线" },
  peak: { en: "Peak", ko: "피크", ja: "ピーク", zh: "峰值" },
};
function t2l(key: string, lang: string): string {
  return T2_LABELS[key]?.[lang] || T2_LABELS[key]?.["en"] || key;
}

// ── Main Page ──
const T2KeywordDetail = () => {
  const { triggerId } = useParams<{ triggerId: string }>();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const track = useTrackEvent();

  useEffect(() => {
    document.documentElement.classList.add("v3-theme");
    if (triggerId) track("t2_keyword_detail_view", { section: triggerId });
    return () => { document.documentElement.classList.remove("v3-theme"); };
  }, [triggerId]);

  // Fetch trigger data
  const { data: trigger, isLoading: triggerLoading } = useQuery({
    queryKey: ["t2-trigger-detail", triggerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("ktrenz_trend_triggers" as any)
        .select("*")
        .eq("id", triggerId)
        .single();
      return data as any;
    },
    enabled: !!triggerId,
  });

  // Fetch artist info
  const { data: artistInfo } = useQuery({
    queryKey: ["t2-artist-info", trigger?.wiki_entry_id],
    queryFn: async () => {
      if (!trigger?.wiki_entry_id) return null;
      const [{ data: star }, { data: wiki }] = await Promise.all([
        supabase.from("ktrenz_stars" as any).select("display_name, name_ko").eq("wiki_entry_id", trigger.wiki_entry_id).single(),
        supabase.from("wiki_entries").select("id, image_url").eq("id", trigger.wiki_entry_id).single(),
      ]);
      const s = star as any;
      return { displayName: s?.display_name || trigger.artist_name, nameKo: s?.name_ko, imageUrl: (wiki as any)?.image_url };
    },
    enabled: !!trigger?.wiki_entry_id,
  });

  // Fetch tracking history (all records)
  const { data: trackingHistory } = useQuery({
    queryKey: ["t2-tracking-history", triggerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("ktrenz_trend_tracking" as any)
        .select("*")
        .eq("trigger_id", triggerId)
        .order("tracked_at", { ascending: true })
        .limit(200);
      return (data ?? []) as any[];
    },
    enabled: !!triggerId,
  });

  // Fetch same artist's other keywords
  const { data: relatedKeywords } = useQuery({
    queryKey: ["t2-related-keywords", trigger?.wiki_entry_id, triggerId],
    queryFn: async () => {
      if (!trigger?.wiki_entry_id) return [];
      const { data } = await supabase
        .from("ktrenz_trend_triggers" as any)
        .select("id, keyword, keyword_ko, keyword_category, influence_index, status, detected_at")
        .eq("wiki_entry_id", trigger.wiki_entry_id)
        .neq("id", triggerId)
        .neq("trigger_source", "naver_shop")
        .order("influence_index", { ascending: false })
        .limit(10);
      return (data ?? []) as any[];
    },
    enabled: !!trigger?.wiki_entry_id,
  });

  // Fetch prediction market data
  const { data: marketData } = useQuery({
    queryKey: ["t2-market-detail", triggerId],
    queryFn: async () => {
      const { data: market } = await supabase
        .from("ktrenz_trend_markets" as any)
        .select("*")
        .eq("trigger_id", triggerId)
        .maybeSingle();
      if (!market) return null;
      const m = market as any;
      // Count unique bettors
      const { count: totalBettors } = await supabase
        .from("ktrenz_trend_bets" as any)
        .select("user_id", { count: "exact", head: true })
        .eq("market_id", m.id);
      // Count total bets
      const { count: totalBets } = await supabase
        .from("ktrenz_trend_bets" as any)
        .select("id", { count: "exact", head: true })
        .eq("market_id", m.id);
      const pD = Number(m.pool_decline);
      const pM = Number(m.pool_mild);
      const pS = Number(m.pool_strong);
      const pE = Number(m.pool_explosive);
      const invSum = (1/pD) + (1/pM) + (1/pS) + (1/pE);
      return {
        ...m,
        prices: {
          decline: (1/pD)/invSum,
          mild: (1/pM)/invSum,
          strong: (1/pS)/invSum,
          explosive: (1/pE)/invSum,
        },
        totalBettors: totalBettors ?? 0,
        totalBets: totalBets ?? 0,
      };
    },
    enabled: !!triggerId,
  });

  // Fetch user's bets for this market
  const { data: myPosition } = useQuery({
    queryKey: ["t2-my-position", marketData?.id, user?.id],
    queryFn: async () => {
      if (!marketData?.id || !user?.id) return null;
      const { data: bets } = await supabase
        .from("ktrenz_trend_bets" as any)
        .select("side, amount, shares")
        .eq("market_id", marketData.id)
        .eq("user_id", user.id);
      if (!bets || bets.length === 0) return null;
      const outcomes = ["decline", "mild", "strong", "explosive"] as const;
      const result: Record<string, { amount: number; shares: number }> = {};
      let totalSpent = 0;
      for (const o of outcomes) {
        const filtered = (bets as any[]).filter(b => b.outcome === o);
        const amount = filtered.reduce((s, b) => s + Number(b.amount), 0);
        const shares = filtered.reduce((s, b) => s + Number(b.shares), 0);
        result[o] = { amount, shares };
        totalSpent += amount;
      }
      return { ...result, totalSpent };
    },
    enabled: !!marketData?.id && !!user?.id,
  });

  const chartData = useMemo(() => {
    if (!trackingHistory?.length) return [];
    return trackingHistory.map((t: any) => ({
      time: formatDateTime(t.tracked_at),
      score: t.interest_score ?? 0,
      delta: t.delta_pct ?? 0,
      region: t.region,
    }));
  }, [trackingHistory]);

  const baselineScore = trigger?.baseline_score ?? null;
  const peakScore = trigger?.peak_score ?? null;

  if (triggerLoading) {
    return (
      <div className="min-h-screen">
        <header className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center gap-3 px-4 bg-background/80 backdrop-blur-lg border-b border-border">
          <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors">
            <ChevronLeft className="w-5 h-5 text-foreground" />
          </button>
        </header>
        <div className={cn("pt-16 px-4 pb-8", !isMobile && "max-w-4xl mx-auto")}>
          <Skeleton className="h-8 w-48 mb-4" />
          <Skeleton className="h-64 w-full rounded-xl mb-4" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!trigger) {
    return (
      <div className="min-h-screen">
        <header className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center gap-3 px-4 bg-background/80 backdrop-blur-lg border-b border-border">
          <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors">
            <ChevronLeft className="w-5 h-5 text-foreground" />
          </button>
        </header>
        <div className={cn("pt-16 px-4 pb-8 text-center", !isMobile && "max-w-4xl mx-auto")}>
          <p className="text-muted-foreground mt-20">Keyword not found.</p>
          <button onClick={() => navigate("/t2")} className="mt-4 text-sm text-primary underline">
            ← {t2l("trendMap", language)}
          </button>
        </div>
      </div>
    );
  }

  const artistName = language === "ko" && artistInfo?.nameKo ? artistInfo.nameKo : (artistInfo?.displayName || trigger.artist_name);
  const keyword = getLocalizedKeyword(trigger, language);
  const context = stripCitations(getLocalizedContext(trigger, language));
  const category = trigger.keyword_category || "brand";
  const influenceIndex = Number(trigger.influence_index) || 0;
  const confidence = Number(trigger.confidence) || 0;
  const elapsedHours = (Date.now() - new Date(trigger.detected_at).getTime()) / 3600000;
  const evidenceImageUrl = trigger.source_image_url || artistInfo?.imageUrl || null;

  return (
    <div className="min-h-screen">
      <SEO
        title={`${trigger.keyword} × ${trigger.artist_name} – T2 Trend Intel`}
        description={`${trigger.keyword} trend driven by ${trigger.artist_name}. Influence Index: +${influenceIndex.toFixed(1)}%`}
        path={`/t2/${triggerId}`}
      />
      {/* Sub-page header with back button */}
      <header className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center gap-3 px-4 bg-background/80 backdrop-blur-lg border-b border-border">
        <button
          onClick={() => navigate(-1)}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-foreground" />
        </button>
        <span className="text-sm font-bold text-foreground truncate">
          {keyword} × {artistName}
        </span>
      </header>

      <div className={cn("pt-16 px-4 pb-8", !isMobile && "max-w-4xl mx-auto")}>

        {/* Hero Header */}
        <div className="relative rounded-2xl overflow-hidden border border-border mb-6">
          {/* Background */}
          <div
            className="absolute inset-0"
            style={{
              background: artistInfo?.imageUrl
                ? `linear-gradient(to bottom, hsla(220, 30%, 15%, 0.7), hsla(220, 30%, 10%, 0.95)), url(${artistInfo.imageUrl}) center/cover no-repeat`
                : "linear-gradient(135deg, hsl(var(--primary) / 0.15), hsl(var(--muted)))",
            }}
          />
          <div className="relative z-10 p-5 sm:p-8">
            <div className="flex items-start gap-4">
              {artistInfo?.imageUrl && (
                <img
                  src={artistInfo.imageUrl}
                  alt={artistName}
                  className="w-14 h-14 sm:w-18 sm:h-18 rounded-xl object-cover border-2 border-white/20 shadow-lg shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <Badge variant="outline" className={cn("text-[11px]", CATEGORY_COLORS[category])}>
                    {CATEGORY_LABELS[category] || category}
                  </Badge>
                  <Badge variant="outline" className={cn(
                    "text-[10px] font-bold",
                    trigger.status === "active"
                      ? "border-green-500/40 text-green-400 bg-green-500/10"
                      : "border-muted-foreground/30 text-muted-foreground"
                  )}>
                    {trigger.status === "active" ? t2l("active", language) : t2l("expired", language)}
                  </Badge>
                </div>
                <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight mb-1">
                  {keyword}
                </h1>
                <p className="text-sm text-white/70">
                  <span className="font-medium text-white/90">{artistName}</span>
                  <span className="mx-1.5 text-white/30">·</span>
                  <Clock className="w-3 h-3 inline mr-0.5 text-white/50" />
                  {formatAge(trigger.detected_at)}
                  {trigger.trigger_source && (
                    <>
                      <span className="mx-1.5 text-white/30">·</span>
                      <span className="text-white/50">{trigger.trigger_source === "global_news" ? "Global" : "Naver"}</span>
                    </>
                  )}
                </p>
              </div>
            </div>

            {/* Key metrics row */}
            <div className="grid grid-cols-3 gap-3 mt-5">
              <div className="rounded-xl bg-white/5 backdrop-blur border border-white/10 p-3 text-center">
                <div className="text-[10px] text-white/50 mb-0.5">{t2l("influence", language)}</div>
                <div className="text-xl font-black text-white">
                  {influenceIndex > 0 ? `+${influenceIndex.toFixed(1)}%` : "—"}
                </div>
              </div>
              <div className="rounded-xl bg-white/5 backdrop-blur border border-white/10 p-3 text-center">
                <div className="text-[10px] text-white/50 mb-0.5">{t2l("baseline", language)}</div>
                <div className="text-xl font-black text-white">
                  {baselineScore ?? "—"}
                </div>
              </div>
              <div className="rounded-xl bg-white/5 backdrop-blur border border-white/10 p-3 text-center">
                <div className="text-[10px] text-white/50 mb-0.5">{t2l("peak", language)}</div>
                <div className="text-xl font-black text-white">
                  {peakScore ?? "—"}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Prediction Market Summary */}
        {marketData && (
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 mb-6">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2 mb-4">
              <Users className="w-4 h-4 text-primary" />
              {language === "ko" ? "사용자 예측" : language === "ja" ? "ユーザー予測" : language === "zh" ? "用户预测" : "Community Predictions"}
            </h2>

            {/* 4-outcome probability bar */}
            <div className="mb-4">
              <div className="grid grid-cols-4 gap-1 text-xs mb-2">
                {([
                  { key: "decline" as const, label: language === "ko" ? "하락" : "<10%", emoji: "📉", color: "text-rose-400" },
                  { key: "mild" as const, label: language === "ko" ? "소폭" : "10~50%", emoji: "📈", color: "text-amber-400" },
                  { key: "strong" as const, label: language === "ko" ? "강세" : "50~100%", emoji: "🔥", color: "text-emerald-400" },
                  { key: "explosive" as const, label: language === "ko" ? "폭발" : "100%+", emoji: "🚀", color: "text-purple-400" },
                ]).map(({ key, label, emoji, color }) => (
                  <div key={key} className="text-center">
                    <span className={cn("font-bold", color)}>{emoji} {(marketData.prices[key] * 100).toFixed(0)}%</span>
                    <div className="text-[9px] text-muted-foreground">{label}</div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-0.5 h-3 rounded-full overflow-hidden">
                <div className="h-full rounded-l-full bg-rose-500 transition-all duration-500" style={{ width: `${Math.max(marketData.prices.decline * 100, 5)}%` }} />
                <div className="h-full bg-amber-500 transition-all duration-500" style={{ width: `${Math.max(marketData.prices.mild * 100, 5)}%` }} />
                <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${Math.max(marketData.prices.strong * 100, 5)}%` }} />
                <div className="h-full rounded-r-full bg-purple-500 transition-all duration-500" style={{ width: `${Math.max(marketData.prices.explosive * 100, 5)}%` }} />
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-muted/50 border border-border/50 p-2.5 text-center">
                <div className="text-[10px] text-muted-foreground mb-0.5">
                  {language === "ko" ? "참여자" : "Participants"}
                </div>
                <div className="text-lg font-black text-foreground">
                  {marketData.totalBettors}
                </div>
              </div>
              <div className="rounded-xl bg-muted/50 border border-border/50 p-2.5 text-center">
                <div className="text-[10px] text-muted-foreground mb-0.5">
                  {language === "ko" ? "총 거래량" : "Volume"}
                </div>
                <div className="text-lg font-black text-foreground">
                  {Number(marketData.total_volume).toLocaleString()}
                  <span className="text-[10px] font-normal text-muted-foreground ml-0.5">P</span>
                </div>
              </div>
              <div className="rounded-xl bg-muted/50 border border-border/50 p-2.5 text-center">
                <div className="text-[10px] text-muted-foreground mb-0.5">
                  {language === "ko" ? "총 예측" : "Total Bets"}
                </div>
                <div className="text-lg font-black text-foreground">
                  {marketData.totalBets}
                </div>
              </div>
            </div>

            {/* My Position */}
            {myPosition && (
              <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
                <div className="text-[11px] font-bold text-foreground">
                  {language === "ko" ? "내 포지션" : "My Position"}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {myPosition.yesAmount > 0 && (
                    <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-2">
                      <div className="text-[10px] text-green-400 mb-0.5">
                        {language === "ko" ? "오를 것 지분" : "Rise Stake"}
                      </div>
                      <div className="text-sm font-bold text-foreground">
                        {myPosition.yesAmount.toLocaleString()}<span className="text-[10px] font-normal text-muted-foreground ml-0.5">P</span>
                      </div>
                      <div className="text-[10px] text-green-400 mt-0.5">
                        {language === "ko" ? "성공시" : "If win"} +{Math.round(myPosition.yesShares - myPosition.yesAmount).toLocaleString()}<span className="text-[9px] text-muted-foreground ml-0.5">P</span>
                      </div>
                    </div>
                  )}
                  {myPosition.noAmount > 0 && (
                    <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-2">
                      <div className="text-[10px] text-red-400 mb-0.5">
                        {language === "ko" ? "내릴 것 지분" : "Fall Stake"}
                      </div>
                      <div className="text-sm font-bold text-foreground">
                        {myPosition.noAmount.toLocaleString()}<span className="text-[10px] font-normal text-muted-foreground ml-0.5">P</span>
                      </div>
                      <div className="text-[10px] text-red-400 mt-0.5">
                        {language === "ko" ? "성공시" : "If win"} +{Math.round(myPosition.noShares - myPosition.noAmount).toLocaleString()}<span className="text-[9px] text-muted-foreground ml-0.5">P</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {language === "ko" ? "총 투자" : "Total invested"}: {myPosition.totalSpent.toLocaleString()}P
                </div>
              </div>
            )}

            {/* Market status */}
            {marketData.expires_at && (
              <div className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Timer className="w-3 h-3" />
                {language === "ko" ? "마감" : "Closes"}: {new Date(marketData.expires_at).toLocaleDateString(language === "ko" ? "ko-KR" : "en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </div>
            )}
          </div>
        )}


        {chartData.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 mb-6">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2 mb-4">
              <BarChart3 className="w-4 h-4 text-primary" />
              Kinterest Score
            </h2>
            <div className="h-56 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <defs>
                    <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickLine={false} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  {baselineScore != null && (
                    <ReferenceLine y={baselineScore} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" label={{ value: "Baseline", fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  )}
                  {peakScore != null && (
                    <ReferenceLine y={peakScore} stroke="hsl(var(--destructive))" strokeDasharray="4 4" label={{ value: "Peak", fontSize: 10, fill: "hsl(var(--destructive))" }} />
                  )}
                  <Area
                    type="monotone"
                    dataKey="score"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#scoreGradient)"
                    dot={chartData.length < 30}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div className="grid gap-6 sm:grid-cols-2">
          {/* Evidence: Why this trend? */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            {/* Source thumbnail with context preview */}
            {evidenceImageUrl && (
              <div className="relative aspect-[2/1] w-full overflow-hidden bg-muted">
                <img src={evidenceImageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                {context && (
                  <p className="absolute bottom-0 left-0 right-0 px-4 pb-3 text-[11px] text-white/90 leading-relaxed line-clamp-2">
                    {context}
                  </p>
                )}
              </div>
            )}
            <div className="p-4 space-y-3">
              <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Newspaper className="w-4 h-4 text-primary" />
                {t2l("whyThisTrend", language)}
              </h2>
              {context ? (
                <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">{context}</p>
              ) : (
                <p className="text-xs text-muted-foreground italic">{t2l("noContext", language)}</p>
              )}
            </div>
          </div>

          {/* Keyword Lifecycle */}
          <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Timer className="w-4 h-4 text-primary" />
              {t2l("keywordLifecycle", language)}
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-muted/30 border border-border p-3">
                <div className="text-[10px] text-muted-foreground mb-1">
                  {trigger.expired_at ? t2l("lifetime", language) : t2l("elapsed", language)}
                </div>
                <div className="text-lg font-bold text-foreground">
                  {(() => {
                    const h = trigger.lifetime_hours && trigger.lifetime_hours > 0
                      ? trigger.lifetime_hours : elapsedHours;
                    return h >= 24 ? `${(h / 24).toFixed(1)}d` : `${h.toFixed(1)}h`;
                  })()}
                </div>
              </div>
              <div className="rounded-xl bg-muted/30 border border-border p-3">
                <div className="text-[10px] text-muted-foreground mb-1">{t2l("timeToPeak", language)}</div>
                <div className="text-lg font-bold text-foreground flex items-center gap-1">
                  {trigger.peak_at ? (
                    <>
                      <Zap className="w-3.5 h-3.5 text-amber-500" />
                      {(() => {
                        const delay = trigger.peak_delay_hours > 0
                          ? trigger.peak_delay_hours
                          : (new Date(trigger.peak_at).getTime() - new Date(trigger.detected_at).getTime()) / 3600000;
                        return delay >= 24 ? `${(delay / 24).toFixed(1)}d` : `${delay.toFixed(1)}h`;
                      })()}
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">{t2l("notPeakedYet", language)}</span>
                  )}
                </div>
              </div>
              <div className="rounded-xl bg-muted/30 border border-border p-3">
                <div className="text-[10px] text-muted-foreground mb-1">{t2l("detected", language)}</div>
                <div className="text-xs font-medium text-foreground">{formatDateTime(trigger.detected_at)}</div>
              </div>
              <div className="rounded-xl bg-muted/30 border border-border p-3">
                <div className="text-[10px] text-muted-foreground mb-1">{t2l("peakTime", language)}</div>
                <div className="text-xs font-medium text-foreground">
                  {trigger.peak_at ? formatDateTime(trigger.peak_at) : "—"}
                </div>
              </div>
            </div>

            {/* Timeline bar */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">0d</span>
              <div className="flex-1 h-2 rounded-full bg-muted/50 overflow-hidden relative">
                {(() => {
                  const maxDays = 14;
                  const h = trigger.lifetime_hours && trigger.lifetime_hours > 0
                    ? trigger.lifetime_hours : elapsedHours;
                  const pct = Math.min(100, (h / (maxDays * 24)) * 100);
                  const peakPct = trigger.peak_at
                    ? Math.min(100, ((new Date(trigger.peak_at).getTime() - new Date(trigger.detected_at).getTime()) / (maxDays * 24 * 3600000)) * 100)
                    : null;
                  return (
                    <>
                      <div className="absolute inset-y-0 left-0 rounded-full bg-primary/60" style={{ width: `${pct}%` }} />
                      {peakPct != null && (
                        <div
                          className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-amber-500 border-2 border-background"
                          style={{ left: `${peakPct}%` }}
                          title="Peak"
                        />
                      )}
                    </>
                  );
                })()}
              </div>
              <span className="text-[10px] text-muted-foreground">14d</span>
            </div>
          </div>
        </div>

        {/* Agency Insight Panel */}
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 mt-6 space-y-4">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" />
              {t2l("agencyInsight", language)}
            </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-muted/30 border border-border p-4">
              <div className="text-[10px] text-muted-foreground mb-1">{t2l("commercialPotential", language)}</div>
              <div className="flex items-center gap-2">
                <div className={cn(
                  "text-lg font-black",
                  influenceIndex >= 50 ? "text-green-500" :
                  influenceIndex >= 20 ? "text-amber-500" :
                  influenceIndex > 0 ? "text-orange-500" : "text-muted-foreground"
                )}>
                  {influenceIndex >= 50 ? t2l("high", language) : influenceIndex >= 20 ? t2l("medium", language) : influenceIndex > 0 ? t2l("low", language) : t2l("tracking", language)}
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {influenceIndex >= 50
                  ? "Strong consumer interest surge. Ideal for brand activation."
                  : influenceIndex >= 20
                  ? "Moderate interest growth. Worth monitoring for partnerships."
                  : influenceIndex > 0
                  ? "Early signal detected. Watch for momentum buildup."
                  : "Waiting for search volume data."}
              </p>
            </div>
            <div className="rounded-xl bg-muted/30 border border-border p-4">
              <div className="text-[10px] text-muted-foreground mb-1">{t2l("reactionSpeed", language)}</div>
              <div className="text-lg font-black text-foreground">
                {trigger.peak_at
                  ? (() => {
                      const delay = (new Date(trigger.peak_at).getTime() - new Date(trigger.detected_at).getTime()) / 3600000;
                      return delay < 6 ? "⚡ Instant" : delay < 24 ? "🔥 Fast" : delay < 72 ? "📈 Gradual" : "🐢 Slow";
                    })()
                  : "⏳ Pending"}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {trigger.peak_at
                  ? `Search interest peaked ${((new Date(trigger.peak_at).getTime() - new Date(trigger.detected_at).getTime()) / 3600000).toFixed(1)}h after news mention.`
                  : "Peak not yet reached. Monitoring in progress."}
              </p>
            </div>
            <div className="rounded-xl bg-muted/30 border border-border p-4">
              <div className="text-[10px] text-muted-foreground mb-1">{t2l("detectionSource", language)}</div>
              <div className="text-lg font-black text-foreground flex items-center gap-1.5">
                {trigger.trigger_source === "global_news" ? (
                  <><Globe className="w-4 h-4 text-blue-400" /> Global</>
                ) : (
                  <><Newspaper className="w-4 h-4 text-green-400" /> Naver</>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {trigger.trigger_source === "global_news"
                  ? "Detected from global media (Soompi, AllKPop, etc.)"
                  : "Detected from Korean news articles on Naver."}
              </p>
            </div>
          </div>
        </div>

        {/* AI Trend Insight */}
        {(baselineScore != null || influenceIndex > 0) && (
          <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-4 sm:p-6 mt-6 space-y-3">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              {language === "ko" ? "AI 인사이트" : language === "ja" ? "AIインサイト" : language === "zh" ? "AI洞察" : "AI Insight"}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {(() => {
                const peakDelay = trigger.peak_at
                  ? (new Date(trigger.peak_at).getTime() - new Date(trigger.detected_at).getTime()) / 3600000
                  : null;
                const cat = CATEGORY_LABELS[category] || category;
                const isViral = influenceIndex >= 50;
                const isGrowing = influenceIndex >= 20;
                const isFastReact = peakDelay != null && peakDelay < 6;
                const isSustained = !isViral && !isGrowing && !isFastReact;

                if (language === "ko") {
                  if (isViral) {
                    return `${artistName}의 "${keyword}" 관련 관심이 폭발적으로 증가하고 있습니다. 팬덤과 일반 대중 모두에서 강한 반응이 감지되었으며, ${cat} 분야의 브랜드라면 지금이 콜라보를 제안할 최적의 타이밍입니다. 이 수준의 관심은 보통 1~2주 내에 소비 행동으로 이어집니다.`;
                  } else if (isGrowing) {
                    return `${artistName}과 "${keyword}"의 연관 관심도가 꾸준히 상승 중입니다. 아직 대중적 폭발 단계는 아니지만, ${cat} 분야에서 선제적 마케팅을 준비하기에 좋은 시점입니다. 경쟁사보다 먼저 움직일 수 있는 골든 타임에 있습니다.`;
                  } else if (isFastReact) {
                    return `"${keyword}" 키워드가 감지 직후 빠르게 확산되고 있습니다. SNS 기반의 바이럴 초기 단계로 보이며, ${cat} 관련 콘텐츠를 빠르게 제작하면 자연스러운 노출 효과를 기대할 수 있습니다.`;
                  } else {
                    return `${artistName}과 "${keyword}"는 급등보다는 안정적인 관심을 유지하고 있습니다. 이 패턴은 이미 검증된 ${cat} 연관성을 의미하며, 단기 캠페인보다는 장기 파트너십에 적합한 시그널입니다.`;
                  }
                }

                if (language === "ja") {
                  if (isViral) {
                    return `${artistName}の「${keyword}」への関心が爆発的に高まっています。ファンダムと一般層の両方から強い反応が検出されており、${cat}分野のブランドにとって今がコラボ提案の最適なタイミングです。`;
                  } else if (isGrowing) {
                    return `${artistName}と「${keyword}」の関連性が着実に上昇中です。${cat}分野で先手を打つマーケティング準備に最適な時期です。`;
                  } else if (isFastReact) {
                    return `「${keyword}」キーワードが検出直後に急速に拡散しています。SNSバイラルの初期段階と見られ、${cat}関連コンテンツの迅速な制作で自然な露出効果が期待できます。`;
                  } else {
                    return `${artistName}と「${keyword}」は安定した関心を維持しています。短期キャンペーンよりも長期パートナーシップに適したシグナルです。`;
                  }
                }

                if (language === "zh") {
                  if (isViral) {
                    return `${artistName}的"${keyword}"相关关注度正在爆发式增长。粉丝和大众都表现出强烈反应，对于${cat}领域的品牌来说，现在是提出合作的最佳时机。`;
                  } else if (isGrowing) {
                    return `${artistName}与"${keyword}"的关联关注度稳步上升。${cat}领域的先发制人营销准备正当其时。`;
                  } else if (isFastReact) {
                    return `"${keyword}"关键词在检测后迅速传播，处于社交媒体病毒式传播的早期阶段，快速制作${cat}相关内容可获得自然曝光效果。`;
                  } else {
                    return `${artistName}与"${keyword}"保持稳定关注，更适合长期合作而非短期营销活动。`;
                  }
                }

                // EN
                if (isViral) {
                  return `Interest in ${artistName} × "${keyword}" is surging. Strong reactions detected from both fandom and general audiences — if you're a ${cat} brand, now is the ideal time to propose a collaboration. This level of buzz typically converts to consumer action within 1–2 weeks.`;
                } else if (isGrowing) {
                  return `The connection between ${artistName} and "${keyword}" is steadily growing. While not yet mainstream, this is the golden window to prepare proactive marketing in ${cat} — move before your competitors do.`;
                } else if (isFastReact) {
                  return `"${keyword}" is spreading rapidly after detection — an early-stage social viral signal. Fast ${cat} content creation can ride the organic wave for maximum exposure.`;
                } else {
                  return `${artistName} × "${keyword}" shows stable, sustained interest rather than a spike. This pattern signals a proven ${cat} association, better suited for long-term partnerships than short-term campaigns.`;
                }
              })()}
            </p>
          </div>
        )}

        {/* Tracking History Table */}
        {trackingHistory && trackingHistory.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 mt-6">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2 mb-4">
              <Activity className="w-4 h-4 text-primary" />
              {t2l("trackingHistory", language)}
              <span className="text-[10px] font-normal text-muted-foreground ml-1">{trackingHistory.length} {t2l("records", language)}</span>
            </h2>
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {[...trackingHistory].reverse().map((t: any) => (
                <div key={t.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-muted/20 border border-border/40">
                  <div className="flex items-center gap-3">
                    {t.region === "world" || !t.region ? (
                      <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                    ) : (
                      <Flag className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                    <span className="text-sm font-bold text-foreground">{t.interest_score}</span>
                  </div>
                  <div className="flex items-center gap-3">
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
                    <span className="text-[10px] text-muted-foreground w-20 text-right">
                      {formatDateTime(t.tracked_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Related Keywords from Same Artist */}
        {relatedKeywords && relatedKeywords.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 mt-6">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-primary" />
              {language === "ko" ? `${artistName}${t2l("otherKeywords", language)}` : `${t2l("otherKeywords", language)} ${artistName}`}
            </h2>
            <div className="flex flex-wrap gap-2">
              {relatedKeywords.map((rk: any) => (
                <button
                  key={rk.id}
                  onClick={() => navigate(`/t2/${rk.id}`)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-xl border transition-all hover:bg-muted/50",
                    rk.status === "active" ? "border-border" : "border-border/40 opacity-60"
                  )}
                >
                  <Badge variant="outline" className={cn("text-[9px] px-1 py-0", CATEGORY_COLORS[rk.keyword_category])}>
                    {(CATEGORY_LABELS[rk.keyword_category] || rk.keyword_category || "").charAt(0)}
                  </Badge>
                  <span className="text-xs font-bold text-foreground">
                    {language === "ko" && rk.keyword_ko ? rk.keyword_ko : rk.keyword}
                  </span>
                  {rk.influence_index > 0 && (
                    <span className="text-[10px] font-bold text-primary">+{Number(rk.influence_index).toFixed(0)}%</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default T2KeywordDetail;
