import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/hooks/useAuth";
import { useTrackEvent } from "@/hooks/useTrackEvent";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TrendingUp, Clock, ExternalLink, Newspaper, Trophy, Info, ChevronRight, Share2, Rocket, Coins } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { TrendTile } from "./T2TrendTreemap";
import { sanitizeImageUrl, isBlockedImageDomain, detectPlatformLogo } from "./T2TrendTreemap";

function getLocalizedKeyword(tile: TrendTile, lang: string): string {
  switch (lang) {
    case "ko": return tile.keywordKo || tile.keyword;
    case "ja": return tile.keywordJa || tile.keyword;
    case "zh": return tile.keywordZh || tile.keyword;
    default: return tile.keyword;
  }
}

function getLocalizedSourceTitle(tile: TrendTile, lang: string): string {
  if (lang === "en" || !tile.sourceTitle) return tile.sourceTitle || "";
  const ctx = lang === "ko" ? tile.contextKo
    : lang === "ja" ? tile.contextJa
    : lang === "zh" ? tile.contextZh
    : null;
  return ctx || tile.sourceTitle;
}

function getLocalizedArtistName(tile: TrendTile, lang: string): string {
  if (lang === "ko" && tile.artistNameKo) return tile.artistNameKo;
  return tile.artistName;
}

const CATEGORY_COLORS: Record<string, string> = {
  brand: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  product: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  place: "bg-green-500/10 text-green-400 border-green-500/30",
  food: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  fashion: "bg-pink-500/10 text-pink-400 border-pink-500/30",
  beauty: "bg-rose-500/10 text-rose-400 border-rose-500/30",
  media: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
  music: "bg-violet-500/10 text-violet-400 border-violet-500/30",
  event: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
};

const T2_LABELS: Record<string, Record<string, string>> = {
  whyTrend: { en: "Why this trend?", ko: "왜 이 트렌드인가?", ja: "なぜこのトレンド？", zh: "为什么是这个趋势？" },
  noContext: { en: "No context available yet.", ko: "아직 맥락 정보가 없습니다.", ja: "コンテキスト情報はまだありません。", zh: "尚无相关信息。" },
  whyRank: { en: "Why", ko: "왜", ja: "なぜ", zh: "为什么" },
  whyRankSuffix: { en: "?", ko: "위인가?", ja: "位？", zh: "位？" },
  surged: { en: "Search volume surged", ko: "검색량이", ja: "検索量が", zh: "搜索量" },
  surgedAfter: { en: "after", ko: "이후", ja: "のニュース後", zh: "新闻后" },
  newsMention: { en: "'s news mention.", ko: "의 뉴스 언급 이후 급등.", ja: "に急増。", zh: "急增。" },
  baselineWas: { en: "Baseline interest was", ko: "기본 관심도", ja: "ベースライン関心度", zh: "基础关注度" },
  peakedAt: { en: ", peaked at", ko: ", 최고", ja: ", ピーク", zh: ", 峰值" },
  highestAmong: { en: "This is the highest influence index among", ko: "이것은", ja: "これは", zh: "这是" },
  activeKeywords: { en: "active keywords.", ko: "개 활성 키워드 중 가장 높은 영향력 지수입니다.", ja: "件のアクティブキーワードの中で最高の影響力指数です。", zh: "个活跃关键词中最高的影响力指数。" },
  trackingStarted: { en: "Tracking just started — waiting for trend data to calculate influence.", ko: "추적이 시작되었습니다 — 영향력 산출을 위해 트렌드 데이터를 기다리고 있습니다.", ja: "トラッキングが開始されました — 影響力算出のためトレンドデータを待っています。", zh: "追踪刚开始 — 等待趋势数据计算影响力。" },
  influence: { en: "Influence", ko: "영향력", ja: "影響力", zh: "影响力" },
  baseline: { en: "Baseline", ko: "기본값", ja: "ベースライン", zh: "基准" },
  peak: { en: "Peak", ko: "최고값", ja: "ピーク", zh: "峰值" },
  by: { en: "by", ko: "by", ja: "by", zh: "by" },
  voteRelevance: { en: "Predict the trend!", ko: "유행을 예측 해보세요!", ja: "トレンドを予測しよう！", zh: "预测趋势！" },
  betYes: { en: "Absolutely 🔥", ko: "당연하지 🔥", ja: "もちろん 🔥", zh: "当然 🔥" },
  betNo: { en: "Hmm 🤷", ko: "글쎄 🤷", ja: "うーん 🤷", zh: "不好说 🤷" },
  betPlaceholder: { en: "Enter K-Token (min 10T)", ko: "K-Token 입력 (최소 10T)", ja: "K-Token入力 (最小10T)", zh: "输入K-Token (最低10T)" },
  placeBet: { en: "Predict", ko: "예측하기", ja: "予測する", zh: "预测" },
  yourBets: { en: "Your bets", ko: "내 예측", ja: "あなたの予測", zh: "我的预测" },
  totalPool: { en: "Total pool", ko: "총 K-Token", ja: "合計K-Token", zh: "总K-Token" },
  odds: { en: "Odds", ko: "확률", ja: "確率", zh: "概率" },
  shares: { en: "shares", ko: "지분", ja: "シェア", zh: "份额" },
  marketSettled: { en: "Results are in!", ko: "결과가 나왔어요!", ja: "結果が出ました！", zh: "结果出来了！" },
  won: { en: "You got it right! 🎉", ko: "맞췄어요! 🎉", ja: "的中！🎉", zh: "猜对了！🎉" },
  lost: { en: "Better luck next time", ko: "다음엔 맞출 거예요", ja: "次こそ！", zh: "下次加油" },
  insufficientPoints: { en: "You need more K-Token 😢", ko: "K-Token이 부족해요 😢", ja: "K-Tokenが足りません 😢", zh: "K-Token不够了 😢" },
  loginToBet: { en: "Sign in to predict", ko: "로그인하고 예측해보세요", ja: "ログインして予測しよう", zh: "登录后预测" },
  betSuccess: { en: "Prediction locked in! ✨", ko: "예측 완료! ✨", ja: "予測完了！✨", zh: "预测成功！✨" },
  betMinError: { en: "Please enter at least 10T", ko: "최소 10T 이상 입력해주세요", ja: "10T以上を入力してください", zh: "请输入至少10T" },
  somethingWentWrong: { en: "Something went wrong, try again", ko: "문제가 발생했어요, 다시 시도해주세요", ja: "エラーが発生しました、再度お試しください", zh: "出了点问题，请重试" },
  boostTrend: { en: "Boost this trend", ko: "이 트렌드 밀어주기", ja: "このトレンドを応援", zh: "推动这个趋势" },
  shareX: { en: "Share on X", ko: "X에 공유", ja: "Xで共有", zh: "分享到X" },
  copied: { en: "Link copied! 📋", ko: "링크 복사했어요! 📋", ja: "リンクコピー済み！📋", zh: "链接已复制！📋" },
  boosted: { en: "Shared! +5 K-Token earned 🚀", ko: "공유 완료! +5 K-Token 획득 🚀", ja: "共有完了！+5 K-Token獲得 🚀", zh: "分享完成！获得+5 K-Token 🚀" },
  readBoostReward: { en: "Read article +3 K-Token", ko: "원문 읽기 +3 K-Token", ja: "元記事を読む +3 K-Token", zh: "阅读原文 +3 K-Token" },
  readBoosted: { en: "Article read! +3 K-Token earned ✅", ko: "읽기 완료! +3 K-Token 획득 ✅", ja: "読了！+3 K-Token獲得 ✅", zh: "已阅读！获得+3 K-Token ✅" },
  alreadyBoosted: { en: "✓ Already earned +3T", ko: "✓ 이미 +3T 획득 완료", ja: "✓ 獲得済み +3T", zh: "✓ 已获得 +3T" },
  alreadyShareBoosted: { en: "You already shared this one", ko: "이미 공유했어요", ja: "すでに共有済みです", zh: "已经分享过了" },
  shareBoostReward: { en: "Share & earn +5 K-Token", ko: "공유하고 +5 K-Token 받기", ja: "共有して +5 K-Token獲得", zh: "分享获得+5 K-Token" },
  alreadyShareBoostedDone: { en: "✓ Already earned +5T", ko: "✓ 이미 +5T 획득 완료", ja: "✓ 獲得済み +5T", zh: "✓ 已获得 +5T" },
  viewFullAnalysis: { en: "View Full Analysis", ko: "상세 분석 보기", ja: "詳細分析を見る", zh: "查看完整分析" },
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
  const navigate = useNavigate();
  const { user, kPoints } = useAuth();
  const queryClient = useQueryClient();
  const track = useTrackEvent();

  const [betOutcome, setBetOutcome] = useState<"mild" | "strong" | "explosive">("mild");
  const [betAmount, setBetAmount] = useState("");

  // Market data
  const { data: marketData } = useQuery({
    queryKey: ["t2-market", tile?.id],
    queryFn: async () => {
      if (!tile) return null;
      const { data } = await supabase
        .from("ktrenz_trend_markets" as any)
        .select("*")
        .eq("trigger_id", tile.id)
        .single();
      return data as any;
    },
    enabled: !!tile,
  });

  // User's bets for this market
  const { data: myBets } = useQuery({
    queryKey: ["t2-my-bets", marketData?.id, user?.id],
    queryFn: async () => {
      if (!marketData?.id || !user) return [];
      const { data } = await supabase
        .from("ktrenz_trend_bets" as any)
        .select("*")
        .eq("market_id", marketData.id)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      return (data ?? []) as any[];
    },
    enabled: !!marketData?.id && !!user,
    placeholderData: (prev) => prev,
  });

  // Bet mutation
  const betMutation = useMutation({
    mutationFn: async ({ outcome, amount }: { outcome: string; amount: number }) => {
      const { data, error } = await supabase.functions.invoke("ktrenz-trend-bet", {
        body: { triggerId: tile!.id, outcome, amount },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      const amount = Number(betAmount);
      // Optimistic: update market data instantly from response
      if (data && marketData) {
        queryClient.setQueryData(["t2-market", tile?.id], (old: any) => ({
          ...(old || marketData),
          pool_mild: data.pools?.mild,
          pool_strong: data.pools?.strong,
          pool_explosive: data.pools?.explosive,
          total_volume: data.totalVolume,
        }));
      }
      // Optimistic: prepend new bet to myBets
      if (data && user) {
        queryClient.setQueryData(["t2-my-bets", marketData?.id, user.id], (old: any[]) => [
          {
            id: crypto.randomUUID(),
            market_id: marketData?.id,
            user_id: user.id,
            outcome: betOutcome,
            amount,
            shares: data.shares,
            payout: null,
            created_at: new Date().toISOString(),
          },
          ...(old || []),
        ]);
      }
      // Optimistic: update points
      queryClient.setQueryData(["ktrenz-points"], (old: any) =>
        old != null ? old - amount : old
      );
      queryClient.setQueryData(["user-points"], (old: any) =>
        old != null ? old - amount : old
      );
      // Background refetch for consistency
      queryClient.invalidateQueries({ queryKey: ["t2-my-bets", marketData?.id, user?.id] });
      queryClient.invalidateQueries({ queryKey: ["t2-market", tile?.id] });
      queryClient.invalidateQueries({ queryKey: ["ktrenz-points"] });
      queryClient.invalidateQueries({ queryKey: ["user-points"] });
      setBetAmount("");
      toast.success(t("betSuccess", language));
    },
    onError: (err: Error) => {
      if (err.message.includes("Insufficient")) {
        toast.error(t("insufficientPoints", language));
      } else {
        toast.error(t("somethingWentWrong", language));
      }
    },
  });

  const handlePlaceBet = () => {
    if (!user) {
      toast.info(t("loginToBet", language));
      return;
    }
    const amount = Number(betAmount);
    if (isNaN(amount) || amount < 10) {
      toast.error(t("betMinError", language));
      return;
    }
    betMutation.mutate({ outcome: betOutcome, amount });
  };

  // Calculate pool distribution for 3 outcomes
  const poolMild = Number(marketData?.pool_mild ?? 0);
  const poolStrong = Number(marketData?.pool_strong ?? 0);
  const poolExplosive = Number(marketData?.pool_explosive ?? 0);
  const totalPool = poolMild + poolStrong + poolExplosive;
  const prices = {
    mild: totalPool > 0 ? poolMild / totalPool : 1/3,
    strong: totalPool > 0 ? poolStrong / totalPool : 1/3,
    explosive: totalPool > 0 ? poolExplosive / totalPool : 1/3,
  };
  const MULTIPLIERS = { mild: 1.2, strong: 3.0, explosive: 10.0 };
  const totalVolume = Number(marketData?.total_volume ?? 0);
  const isSettled = marketData?.status === "settled";
  const marketOutcome = marketData?.outcome;

  // Boost count
  const { data: boostCount } = useQuery({
    queryKey: ["t2-keyword-boosts", tile?.id],
    queryFn: async () => {
      if (!tile) return 0;
      const { count } = await supabase
        .from("ktrenz_keyword_boosts" as any)
        .select("id", { count: "exact", head: true })
        .eq("trigger_id", tile.id);
      return count ?? 0;
    },
    enabled: !!tile,
  });

  // Read boost check
  const { data: hasReadBoosted } = useQuery({
    queryKey: ["t2-read-boost", tile?.id, user?.id],
    queryFn: async () => {
      if (!tile || !user) return false;
      const { data } = await supabase
        .from("ktrenz_keyword_boosts" as any)
        .select("id")
        .eq("trigger_id", tile.id)
        .eq("user_id", user.id)
        .eq("platform", "read")
        .limit(1);
      return (data ?? []).length > 0;
    },
    enabled: !!tile && !!user,
  });

  // Share boost check
  const { data: hasShareBoosted } = useQuery({
    queryKey: ["t2-share-boost", tile?.id, user?.id],
    queryFn: async () => {
      if (!tile || !user) return false;
      const { data } = await supabase
        .from("ktrenz_keyword_boosts" as any)
        .select("id, platform")
        .eq("trigger_id", tile.id)
        .eq("user_id", user.id)
        .in("platform", ["x", "copy"])
        .limit(1);
      return (data ?? []).length > 0;
    },
    enabled: !!tile && !!user,
  });
  const handleBoost = async (platform: "x" | "copy") => {
    if (!tile) return;
    const keyword = getLocalizedKeyword(tile, language);
    const artist = getLocalizedArtistName(tile, language);
    const url = `${window.location.origin}/t2/${tile.id}`;
    const text = `🔥 ${keyword} × ${artist} is trending on K-Trendz!\n\n#KTrendz #Kpop #${artist.replace(/\s/g, "")}`;

    if (platform === "x") {
      track("t2_share", { artist_name: artist, section: keyword, url });
      window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, "_blank");
    } else {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      toast.success(t("copied", language));
    }

    // Record boost + award points (check duplicate per platform)
    if (user) {
      const { data: existing } = await supabase
        .from("ktrenz_keyword_boosts" as any)
        .select("id")
        .eq("trigger_id", tile.id)
        .eq("user_id", user.id)
        .eq("platform", platform)
        .limit(1);
      if ((existing ?? []).length === 0) {
        await supabase
          .from("ktrenz_keyword_boosts" as any)
          .insert({ trigger_id: tile.id, user_id: user.id, platform } as any);
        await supabase.rpc("ktrenz_increment_points" as any, { p_user_id: user.id, p_amount: 5 });
        queryClient.invalidateQueries({ queryKey: ["t2-keyword-boosts", tile?.id] });
        queryClient.invalidateQueries({ queryKey: ["t2-share-boost", tile.id, user.id] });
        toast.success(t("boosted", language));
      } else {
        toast.info(t("alreadyShareBoosted", language));
      }
    }
  };

  const handleReadBoost = async () => {
    if (!tile || !user || hasReadBoosted) return;
    await supabase
      .from("ktrenz_keyword_boosts" as any)
      .insert({ trigger_id: tile.id, user_id: user.id, platform: "read" } as any);
    await supabase.rpc("ktrenz_increment_points" as any, { p_user_id: user.id, p_amount: 3 });
    queryClient.invalidateQueries({ queryKey: ["t2-read-boost", tile.id, user.id] });
    queryClient.invalidateQueries({ queryKey: ["t2-keyword-boosts", tile.id] });
    toast.success(t("readBoosted", language));
  };

  if (!tile) return null;

  return (
    <Sheet open={!!tile} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[80dvh] overflow-hidden border-border sm:max-w-lg sm:mx-auto flex flex-col">
        <SheetHeader className="pb-3 shrink-0">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="w-5 h-5 text-primary" />
            {getLocalizedKeyword(tile, language)}
          </SheetTitle>
          {/* Artist name row */}
          <button
            onClick={() => {
              if (tile.starId) {
                onClose();
                navigate(`/t2/artist/${tile.starId}`);
              }
            }}
            className={cn(
              "mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-semibold transition-colors w-fit",
              tile.starId
                ? "bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer"
                : "text-muted-foreground cursor-default"
            )}
          >
            <span className="text-xs text-muted-foreground">by</span>
            {getLocalizedArtistName(tile, language)}
            {tile.starId && <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        </SheetHeader>

        <div className="space-y-4 overflow-y-auto flex-1 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
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
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatAge(tile.detectedAt)}
            </span>
          </div>

          {/* Evidence: Why this trend? — Card with thumbnail */}
          <div className="rounded-xl bg-muted/30 border border-border overflow-hidden">
            {/* Source thumbnail + title card */}
            {(tile.sourceTitle || tile.sourceImageUrl) && (
              <div className="relative">
                {(() => {
                  const rawImg = sanitizeImageUrl(tile.sourceImageUrl);
                  const safeImg = rawImg && !isBlockedImageDomain(rawImg) ? rawImg : null;
                  const platformLogo = detectPlatformLogo(tile.sourceUrl, tile.sourceImageUrl);
                  // Always try artist image as primary fallback
                  const displayImg = safeImg || tile.artistImageUrl || platformLogo;
                  
                  // Even if no source/platform image, show artist image or category placeholder
                  const finalImg = displayImg || null;
                  
                  if (finalImg) {
                    const isLogoOnly = platformLogo && !safeImg && !tile.artistImageUrl;
                    return (
                      <div className="relative w-full overflow-hidden bg-muted">
                        <img
                          src={finalImg}
                          alt={tile.sourceTitle || ""}
                          className={cn("w-full h-full object-cover", isLogoOnly && "object-contain p-8 bg-muted")}
                          loading="lazy"
                          onError={(e) => {
                            // On image load error, try artist image or hide
                            const target = e.currentTarget;
                            if (tile.artistImageUrl && target.src !== tile.artistImageUrl) {
                              target.src = tile.artistImageUrl;
                            } else {
                              target.style.display = "none";
                            }
                          }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                        <div className="absolute bottom-0 left-0 right-0 p-3">
                          <p className="text-[11px] font-bold text-white/90 line-clamp-2 leading-snug drop-shadow">
                            {getLocalizedSourceTitle(tile, language)}
                          </p>
                          <div className="flex items-center gap-1 mt-1">
                            <ExternalLink className="w-2.5 h-2.5 text-white/60" />
                            <span className="text-[10px] text-white/60">
                              {tile.sourceUrl ? new URL(tile.sourceUrl).hostname.replace("www.", "") : ""}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  
                  return tile.sourceTitle ? (
                  <div className="flex items-start gap-2.5 p-3 border-b border-border/50">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Newspaper className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {tile.sourceUrl ? (
                        <a
                          href={tile.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-semibold text-foreground hover:text-primary transition-colors line-clamp-2 leading-snug"
                          onClick={() => { track("t2_external_link_click", { artist_name: tile.artistName, artist_slug: tile.wikiEntryId, url: tile.sourceUrl || "" }); handleReadBoost(); }}
                        >
                          {getLocalizedSourceTitle(tile, language)}
                        </a>
                      ) : (
                        <span className="text-xs font-semibold text-foreground line-clamp-2 leading-snug">
                          {getLocalizedSourceTitle(tile, language)}
                        </span>
                      )}
                      {tile.sourceUrl && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                          <ExternalLink className="w-2.5 h-2.5" />
                          {new URL(tile.sourceUrl).hostname.replace("www.", "")}
                        </span>
                      )}
                    </div>
                  </div>
                ) : null;
                })()}
              </div>
            )}

            {/* Context body */}
            <div className="p-3 space-y-1.5">
              <h3 className="text-base font-bold text-foreground flex items-center gap-1.5">
                <Newspaper className="w-4.5 h-4.5 text-primary" />
                {t("whyTrend", language)}
              </h3>
              {/* Article snippet */}
              {tile.sourceSnippet && (
                <p className="text-sm text-foreground/80 leading-relaxed border-l-2 border-primary/30 pl-2.5 line-clamp-6">
                  {tile.sourceSnippet}
                </p>
              )}
              {(() => {
                const rawCtx = language === "ko" ? (tile.contextKo || tile.context)
                  : language === "ja" ? (tile.contextJa || tile.context)
                  : language === "zh" ? (tile.contextZh || tile.context)
                  : tile.context;
                const ctx = rawCtx ? rawCtx.replace(/\[\d+\]/g, "").trim() : null;
                return ctx ? (
                  <p className="text-sm text-muted-foreground leading-relaxed">{ctx}</p>
                ) : !tile.sourceSnippet ? (
                  <p className="text-xs text-muted-foreground italic">{t("noContext", language)}</p>
                ) : null;
              })()}
            </div>

            {/* Read boost reward indicator */}
            {user && (
              <div className="px-3 pb-2 flex justify-end">
                {tile.sourceUrl && !hasReadBoosted ? (
                  <a
                    href={tile.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-medium text-emerald-500/70 hover:text-emerald-400 transition-colors"
                    onClick={handleReadBoost}
                  >
                    {t("readBoostReward", language)}
                  </a>
                ) : (
                  <span className={cn(
                    "text-[10px] font-medium",
                    hasReadBoosted ? "text-emerald-400" : "text-emerald-500/70"
                  )}>
                    {hasReadBoosted ? t("alreadyBoosted", language) : t("readBoostReward", language)}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Ranking explanation: Why this rank? */}
          {rank != null && (
            <div className="rounded-xl bg-muted/30 border border-border p-3 space-y-2">
              <h3 className="text-base font-bold text-foreground flex items-center gap-1.5">
                <Info className="w-4.5 h-4.5 text-primary" />
                {t("whyRank", language)} #{rank}{t("whyRankSuffix", language)}
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {tile.influenceIndex > 0 ? (
                  <>
                    {t("surged", language)} <span className="font-bold text-foreground">+{tile.influenceIndex.toFixed(1)}%</span> {t("surgedAfter", language)} {getLocalizedArtistName(tile, language)}{t("newsMention", language)}
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
              <div className="text-[11px] text-muted-foreground mb-1">{t("baseline", language)}</div>
              <div className="text-xl font-bold text-foreground">
                {tile.baselineScore != null ? tile.baselineScore : "—"}
              </div>
            </div>
            <div className="rounded-lg bg-muted/30 border border-border p-3">
              <div className="text-[11px] text-muted-foreground mb-1">{t("peak", language)}</div>
              <div className="text-xl font-bold text-foreground">
                {tile.peakScore != null ? tile.peakScore : "—"}
              </div>
            </div>
          </div>



          {/* FPMM Prediction Market */}
          <div className="rounded-xl bg-muted/30 border border-border p-4 space-y-4">
            <div className="space-y-3">
              <p className="text-lg font-bold text-foreground text-center flex items-center justify-center gap-2">
                <Coins className="w-5 h-5 text-primary" />
                {t("voteRelevance", language)}
              </p>

              {/* 3-outcome selector with multipliers */}
              <div className="grid grid-cols-3 gap-2">
                {([
                  { key: "mild" as const, label: language === "ko" ? "소폭" : "Mild", threshold: language === "ko" ? "<15% 상승" : "<15% rise", emoji: "🌱", color: "amber", multi: "1.2x" },
                  { key: "strong" as const, label: language === "ko" ? "강세" : "Strong", threshold: language === "ko" ? "15~100% 상승" : "15~100% rise", emoji: "🔥", color: "emerald", multi: "3x" },
                  { key: "explosive" as const, label: language === "ko" ? "폭발" : "Explosive", threshold: language === "ko" ? "100%+ 상승" : "100%+ rise", emoji: "🚀", color: "purple", multi: "10x" },
                ]).map(({ key, label, threshold, emoji, color, multi }) => (
                  <div
                    key={key}
                    className={cn(
                      "rounded-lg p-2.5 text-center cursor-pointer transition-all border-2",
                      betOutcome === key
                        ? `bg-${color}-500/20 border-${color}-500/50`
                        : `bg-${color}-500/5 border-${color}-500/15 hover:border-${color}-500/30`
                    )}
                    onClick={() => setBetOutcome(key)}
                  >
                    <div className="text-lg">{emoji}</div>
                    <div className="text-[10px] font-medium text-foreground">{label}</div>
                    <div className={cn("text-sm font-black", `text-${color}-400`)}>{multi}</div>
                    <div className="text-[9px] text-teal-400 mt-0.5">{threshold}</div>
                  </div>
                ))}
              </div>

              {/* Probability bar */}
              <div className="flex items-center gap-0.5 h-6 rounded-full overflow-hidden">
                {([
                  { key: "mild" as const, color: "bg-amber-500" },
                  { key: "strong" as const, color: "bg-emerald-500" },
                  { key: "explosive" as const, color: "bg-purple-500" },
                ]).map(({ key, color }, i) => (
                  <div
                    key={key}
                    className={cn("h-full transition-all duration-500", color, i === 0 && "rounded-l-full", i === 2 && "rounded-r-full")}
                    style={{ width: `${Math.max(prices[key] * 100, 8)}%` }}
                  />
                ))}
              </div>

              {/* My Position */}
              {myBets && myBets.length > 0 && (() => {
                const outcomes = ["mild", "strong", "explosive"] as const;
                const outcomeEmoji: Record<string, string> = { mild: "📈", strong: "🔥", explosive: "🚀" };
                const outcomeColor: Record<string, string> = { mild: "amber", strong: "emerald", explosive: "purple" };
                const stakes = Object.fromEntries(outcomes.map(o => [o, {
                  amount: myBets.filter((b: any) => b.outcome === o).reduce((s: number, b: any) => s + Number(b.amount), 0),
                  shares: myBets.filter((b: any) => b.outcome === o).reduce((s: number, b: any) => s + Number(b.shares), 0),
                }]));
                const totalInvested = outcomes.reduce((s, o) => s + stakes[o].amount, 0);
                return (
                  <div className="rounded-lg bg-muted/50 border border-border p-3 space-y-2">
                    <p className="text-[11px] font-bold text-foreground">{language === "ko" ? "내 포지션" : "My Position"}</p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {outcomes.filter(o => stakes[o].amount > 0).map(o => (
                        <div key={o} className={cn(`rounded-md bg-${outcomeColor[o]}-500/10 border border-${outcomeColor[o]}-500/20 p-2 text-center`)}>
                          <div className="text-[10px] text-muted-foreground">{outcomeEmoji[o]} {o}</div>
                          <div className={cn("text-sm font-bold", `text-${outcomeColor[o]}-400`)}>{stakes[o].amount.toLocaleString()} <span className="text-muted-foreground/60">T</span></div>
                          <div className="text-[10px] text-muted-foreground">
                            {language === "ko" ? "성공시" : "If win"}{" "}
                            <span className={cn("font-semibold", `text-${outcomeColor[o]}-400`)}>
                              ×{MULTIPLIERS[o]} = {Math.round(stakes[o].amount * MULTIPLIERS[o]).toLocaleString()} <span className="text-muted-foreground/60">T</span>
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="text-[10px] text-muted-foreground text-center">
                      {language === "ko" ? "총 투자" : "Total invested"}: <span className="font-bold text-foreground">{totalInvested.toLocaleString()} <span className="text-muted-foreground/60 font-normal">T</span></span>
                    </div>
                  </div>
                );
              })()}

              {/* Settled state */}
              {isSettled ? (
                <div className="rounded-lg bg-muted/50 border border-border p-3 text-center space-y-1">
                  <p className="text-sm font-bold text-foreground">{t("marketSettled", language)}</p>
                  <Badge variant="default" className="text-xs capitalize">
                    {marketOutcome}
                  </Badge>
                  {myBets && myBets.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {myBets.map((bet: any) => (
                        <div key={bet.id} className="text-[11px] text-muted-foreground">
                          {bet.outcome} {Number(bet.amount).toLocaleString()} T → {bet.payout != null
                            ? (bet.payout > 0
                              ? <span className="text-emerald-400 font-bold">+{Number(bet.payout).toLocaleString()} T {t("won", language)}</span>
                              : <span className="text-rose-400">{t("lost", language)}</span>)
                            : "..."}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Bet input */}
                  <div className="flex items-center gap-2">
                     <Input
                       type="number"
                       inputMode="numeric"
                       min={10}
                       max={1000}
                       placeholder="10~1000T"
                       value={betAmount}
                       onChange={(e) => setBetAmount(e.target.value)}
                       className="flex-1 h-10 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    {user && (
                      <span className="text-[11px] font-bold text-teal-400 whitespace-nowrap">
                        {Number(kPoints).toLocaleString()} <span className="text-muted-foreground/60 font-normal">T</span>
                      </span>
                    )}
                  </div>
                  {/* Expected return display */}
                  {betAmount && Number(betAmount) >= 10 && (
                    <div className="text-center text-teal-400 text-sm font-bold">
                      {language === "ko" ? "예상 수익" : "Expected return"}: {Math.round(Number(betAmount) * MULTIPLIERS[betOutcome]).toLocaleString()} <span className="text-muted-foreground/60 font-normal">T</span>
                      <span className="text-[10px] text-muted-foreground ml-1">(×{MULTIPLIERS[betOutcome]})</span>
                    </div>
                  )}
                  <Button
                    className="w-full gap-2"
                    onClick={handlePlaceBet}
                    disabled={betMutation.isPending || !betAmount}
                  >
                    {betMutation.isPending ? (
                      <>
                        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        {language === "ko" ? "처리 중..." : "Processing..."}
                      </>
                    ) : (
                      <>
                        <Coins className="w-4 h-4" />
                        {language === "ko" ? "예측하기" : "Predict"}
                      </>
                    )}
                  </Button>
                </>
              )}
            </div>

            {/* Boost */}
            <div className="border-t border-border/50 pt-3">
              <h3 className="text-base font-bold text-foreground mb-2.5 flex items-center gap-1.5">
                <Rocket className="w-4.5 h-4.5 text-primary" />
                {t("boostTrend", language)}
                {(boostCount ?? 0) > 0 && (
                  <Badge variant="outline" className="text-[10px] ml-1 border-primary/30 text-primary">
                    🔥 {boostCount}
                  </Badge>
                )}
              </h3>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs flex-1"
                  onClick={() => handleBoost("x")}
                >
                  <Share2 className="w-3.5 h-3.5" />
                  {t("shareX", language)}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs"
                  onClick={() => handleBoost("copy")}
                >
                  📋
                </Button>
              </div>
              {user && (
                <div className="flex justify-end mt-2">
                  <span className={cn(
                    "text-[10px] font-medium",
                    hasShareBoosted ? "text-emerald-400" : "text-emerald-500/70"
                  )}>
                    {hasShareBoosted ? t("alreadyShareBoostedDone", language) : t("shareBoostReward", language)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Detail page button */}
          <Button
            variant="secondary"
            className="w-full gap-2"
            onClick={() => {
              navigate(`/t2/${tile.id}${window.location.search}`);
            }}
          >
            {t("viewFullAnalysis", language)}
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default T2DetailSheet;
