import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/hooks/useAuth";
import { useTrackEvent } from "@/hooks/useTrackEvent";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, TrendingUp, Clock, ExternalLink, Newspaper, Trophy, Info, ChevronRight, Share2, Rocket, Coins, Crosshair, Target } from "lucide-react";
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
  brand: "text-blue-400 border-blue-500/30",
  product: "text-purple-400 border-purple-500/30",
  place: "text-green-400 border-green-500/30",
  food: "text-orange-400 border-orange-500/30",
  fashion: "text-pink-400 border-pink-500/30",
  beauty: "text-rose-400 border-rose-500/30",
  media: "text-cyan-400 border-cyan-500/30",
  music: "text-violet-400 border-violet-500/30",
  event: "text-yellow-600 border-yellow-600/40",
};

const T2_LABELS: Record<string, Record<string, string>> = {
  whyTrend: { en: "Why this trend?", ko: "왜 이 트렌드인가?", ja: "なぜこのトレンド？", zh: "为什么是这个趋势？" },
  noContext: { en: "No context available yet.", ko: "아직 맥락 정보가 없습니다.", ja: "コンテキスト情報はまだありません。", zh: "尚无相关信息。" },
  whyRank: { en: "Why", ko: "왜", ja: "なぜ", zh: "为什么" },
  whyRankSuffix: { en: "?", ko: "위인가?", ja: "位？", zh: "位？" },
  trackingStarted: { en: "Tracking just started — waiting for trend data.", ko: "추적이 막 시작되었습니다.", ja: "トラッキング開始 — データ待ち", zh: "追踪刚开始" },
  momentum: { en: "Momentum", ko: "추세", ja: "モメンタム", zh: "趋势" },
  detectedPlatforms: { en: "platforms detected", ko: "개 플랫폼 감지", ja: "プラットフォーム検出", zh: "个平台检测到" },
  by: { en: "by", ko: "by", ja: "by", zh: "by" },
  voteRelevance: { en: "Will it trend more tomorrow?", ko: "내일 더 유행할지 맞춰 봅시다!", ja: "明日もっと流行る？当ててみよう！", zh: "明天会更火吗？来猜猜看！" },
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
  boostTrend: { en: "Spread this trend", ko: "이 트렌드 확산하기", ja: "このトレンドを広める", zh: "扩散这个趋势" },
  shareX: { en: "Share on X", ko: "X에 공유", ja: "Xで共有", zh: "分享到X" },
  copied: { en: "Link copied! 📋", ko: "링크 복사했어요! 📋", ja: "リンクコピー済み！📋", zh: "链接已复制！📋" },
  boosted: { en: "Shared! +5 K-Token earned 🚀", ko: "공유 완료! +5 K-Token 획득 🚀", ja: "共有完了！+5 K-Token獲得 🚀", zh: "分享完成！获得+5 K-Token 🚀" },
  readOriginal: { en: "Read original", ko: "원문 읽기", ja: "元記事を読む", zh: "阅读原文" },
  alreadyShareBoosted: { en: "You already shared this one", ko: "이미 공유했어요", ja: "すでに共有済みです", zh: "已经分享过了" },
  shareBoostReward: { en: "Share this trend", ko: "트렌드 공유하기", ja: "トレンドを共有", zh: "分享趋势" },
  alreadyShareBoostedDone: { en: "✓ Shared", ko: "✓ 공유 완료", ja: "✓ 共有済み", zh: "✓ 已分享" },
  viewFullAnalysis: { en: "View Full Analysis", ko: "상세 분석 보기", ja: "詳細分析を見る", zh: "查看完整分析" },
  followKeyword: { en: "Track", ko: "추적", ja: "追跡", zh: "追踪" },
  unfollowKeyword: { en: "Tracking", ko: "추적중", ja: "追跡中", zh: "追踪中" },
  followedToast: { en: "Tracking this keyword! 🎯", ko: "키워드 추적 시작! 🎯", ja: "キーワード追跡開始！🎯", zh: "开始追踪关键词！🎯" },
  unfollowedToast: { en: "Stopped tracking", ko: "추적 해제", ja: "追跡解除", zh: "已取消追踪" },
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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
      queryClient.invalidateQueries({ queryKey: ["hero-bet-keywords", user?.id] });
      setBetAmount("");
      track("trend_bet_placed", { artist_name: tile?.artistName, section: tile?.keyword });
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
  // Related keywords: same artist + group members (prioritize same category)
  const { data: relatedKeywords } = useQuery({
    queryKey: ["t2-related-keywords", tile?.wikiEntryId, tile?.starId, tile?.id, tile?.category],
    queryFn: async () => {
      if (!tile?.wikiEntryId) return [];

      // 1. Get group family wiki_entry_ids
      const familyWikiIds = new Set<string>([tile.wikiEntryId]);
      if (tile.starId) {
        // Check if this star belongs to a group
        const { data: star } = await supabase
          .from("ktrenz_stars" as any)
          .select("group_star_id")
          .eq("id", tile.starId)
          .single();
        const groupId = (star as any)?.group_star_id;
        if (groupId) {
          // Get all members of the same group
          const { data: members } = await supabase
            .from("ktrenz_stars" as any)
            .select("wiki_entry_id")
            .or(`group_star_id.eq.${groupId},id.eq.${groupId}`)
            .limit(30);
          (members ?? []).forEach((m: any) => { if (m.wiki_entry_id) familyWikiIds.add(m.wiki_entry_id); });
        } else {
          // This might be a group itself — get its members
          const { data: members } = await supabase
            .from("ktrenz_stars" as any)
            .select("wiki_entry_id")
            .eq("group_star_id", tile.starId)
            .limit(30);
          (members ?? []).forEach((m: any) => { if (m.wiki_entry_id) familyWikiIds.add(m.wiki_entry_id); });
        }
      }

      // 2. Fetch triggers from all family members
      const { data } = await supabase
        .from("ktrenz_trend_triggers" as any)
        .select("id, keyword, keyword_ko, keyword_category, influence_index, status, wiki_entry_id")
        .in("wiki_entry_id", Array.from(familyWikiIds))
        .neq("id", tile.id)
        .in("status", ["active", "expired"])
        .order("detected_at", { ascending: false })
        .limit(20);

      // 3. Sort: same category first, then same artist, then by influence
      const results = (data ?? []) as any[];
      results.sort((a: any, b: any) => {
        const aCat = a.keyword_category === tile.category ? 1 : 0;
        const bCat = b.keyword_category === tile.category ? 1 : 0;
        if (aCat !== bCat) return bCat - aCat;
        const aSame = a.wiki_entry_id === tile.wikiEntryId ? 1 : 0;
        const bSame = b.wiki_entry_id === tile.wikiEntryId ? 1 : 0;
        if (aSame !== bSame) return bSame - aSame;
        return (b.influence_index ?? 0) - (a.influence_index ?? 0);
      });

      return results.slice(0, 10);
    },
    enabled: !!tile?.wikiEntryId,
    staleTime: 5 * 60_000,
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
    // Points now awarded via Daily Mission system only
    queryClient.invalidateQueries({ queryKey: ["t2-read-boost", tile.id, user.id] });
    queryClient.invalidateQueries({ queryKey: ["t2-keyword-boosts", tile.id] });
    toast.success(t("readBoosted", language));
  };

  // Keyword follow/track
  const { data: isFollowing, refetch: refetchFollow } = useQuery({
    queryKey: ["t2-keyword-follow", tile?.id, user?.id],
    queryFn: async () => {
      if (!tile || !user) return false;
      const { data } = await supabase
        .from("ktrenz_keyword_follows" as any)
        .select("id")
        .eq("trigger_id", tile.id)
        .eq("user_id", user.id)
        .limit(1);
      return (data ?? []).length > 0;
    },
    enabled: !!tile && !!user,
  });

  const handleToggleFollow = async () => {
    if (!tile || !user) {
      toast.info(t("loginToBet", language));
      return;
    }
    if (isFollowing) {
      await supabase
        .from("ktrenz_keyword_follows" as any)
        .delete()
        .eq("trigger_id", tile.id)
        .eq("user_id", user.id);
      toast.info(t("unfollowedToast", language));
    } else {
      await supabase.from("ktrenz_keyword_follows" as any).insert({
        user_id: user.id,
        trigger_id: tile.id,
        keyword: tile.keyword,
        keyword_ko: tile.keywordKo || null,
        star_id: tile.starId || null,
        artist_name: tile.artistName || null,
        last_influence_index: tile.influenceIndex || 0,
      } as any);
      track("t2_keyword_follow", { artist_name: tile.artistName, section: tile.keyword });
      toast.success(t("followedToast", language));
    }
    refetchFollow();
    queryClient.invalidateQueries({ queryKey: ["t2-keyword-follow", tile.id, user.id] });
    queryClient.invalidateQueries({ queryKey: ["t2-keyword-follows-list", user.id] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-tracked-keywords", user.id] });
  };

  if (!tile) return null;

  return (
    <Sheet open={!!tile} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[90dvh] overflow-hidden border-border sm:max-w-lg sm:mx-auto flex flex-col gap-0 bg-background">
        <SheetHeader className="pb-4 shrink-0 bg-background -mx-6 px-6 -mt-6 pt-6 rounded-t-2xl border-b border-border">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <MessageCircle className="w-5 h-5 text-primary" style={{ transform: 'scaleX(-1)' }} />
            {getLocalizedKeyword(tile, language)}
          </SheetTitle>
          <SheetDescription className="sr-only">{getLocalizedArtistName(tile, language)} trend detail</SheetDescription>
          {/* Artist + meta row */}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                if (tile.starId) {
                  onClose();
                  navigate(`/t2/artist/${tile.starId}`);
                }
              }}
              tabIndex={-1}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-sm font-semibold transition-colors",
                tile.starId
                  ? "bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
                  : "bg-primary/80 text-primary-foreground cursor-default"
              )}
            >
              <span className="text-xs text-primary-foreground/70">by</span>
              {getLocalizedArtistName(tile, language)}
              {tile.starId && <ChevronRight className="w-3.5 h-3.5" />}
            </button>
            {rank != null && (
              <Badge className="bg-background text-primary border-muted-foreground/20 text-[11px] font-medium hover:bg-background">
                <Trophy className="w-3 h-3 mr-0.5" />
                #{rank}
              </Badge>
            )}
            <Badge variant="outline" className={cn("text-[11px] bg-background", CATEGORY_COLORS[tile.category] || "")}>
              {tile.category}
            </Badge>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatAge(tile.detectedAt)}
            </span>
          </div>
        </SheetHeader>

        <div ref={scrollContainerRef} className="space-y-4 overflow-y-auto overflow-x-hidden flex-1 scrollbar-hide -mx-6 px-6 pt-0" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>

          {/* Evidence: Why this trend? — Card with thumbnail */}
          <div>
          {/* Source thumbnail + title card */}
          {(tile.sourceTitle || tile.sourceImageUrl || (tile.triggerSource && ["tiktok", "instagram"].includes(tile.triggerSource))) && (
            <div className="relative">
              {(() => {
                // Social embed for TikTok/Instagram
                const isSocialSource = tile.triggerSource && ["tiktok", "instagram"].includes(tile.triggerSource);
                const meta = tile.metadata || {};
                const tiktokVideoId = meta.embed_video_id;
                const instaShortcode = meta.embed_shortcode;

                if (isSocialSource && (tiktokVideoId || instaShortcode)) {
                  const embedUrl = tiktokVideoId
                    ? `https://www.tiktok.com/embed/v2/${tiktokVideoId}`
                    : `https://www.instagram.com/p/${instaShortcode}/embed/`;
                  const embedHeight = tiktokVideoId ? 580 : 480;

                  return (
                    <div className="relative -mx-6 overflow-hidden bg-muted">
                      <iframe
                        src={embedUrl}
                        className="w-full border-0"
                        style={{ height: `${embedHeight}px` }}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                      <button
                        onClick={(e) => { e.stopPropagation(); handleToggleFollow(); }}
                        className={cn(
                          "absolute top-3 right-3 z-10 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-bold transition-all shadow-lg",
                          isFollowing
                            ? "bg-primary text-primary-foreground"
                            : "bg-black/50 text-white/90 backdrop-blur-sm border border-white/20 hover:bg-primary hover:text-primary-foreground"
                        )}
                      >
                        <Crosshair className="w-3 h-3" />
                        {isFollowing ? t("unfollowKeyword", language) : t("followKeyword", language)}
                      </button>
                    </div>
                  );
                }

                // Fallback: image thumbnail
                const rawImg = sanitizeImageUrl(tile.sourceImageUrl);
                const safeImg = rawImg && !isBlockedImageDomain(rawImg) ? rawImg : null;
                const platformLogo = detectPlatformLogo(tile.sourceUrl, tile.sourceImageUrl);
                const displayImg = safeImg || tile.artistImageUrl || platformLogo;
                const finalImg = displayImg || null;
                
                if (finalImg) {
                  const isLogoOnly = platformLogo && !safeImg && !tile.artistImageUrl;
                  return (
                    <div className="relative -mx-6 overflow-hidden bg-muted">
                      <img
                        src={finalImg}
                        alt={tile.sourceTitle || ""}
                        className={cn("w-full h-full object-cover", isLogoOnly && "object-contain p-8 bg-muted")}
                        loading="lazy"
                        onError={(e) => {
                          const target = e.currentTarget;
                          if (tile.artistImageUrl && target.src !== tile.artistImageUrl) {
                            target.src = tile.artistImageUrl;
                          } else {
                            target.style.display = "none";
                          }
                        }}
                      />
                      <button
                        onClick={(e) => { e.stopPropagation(); handleToggleFollow(); }}
                        className={cn(
                          "absolute top-3 right-3 z-10 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-bold transition-all shadow-lg",
                          isFollowing
                            ? "bg-primary text-primary-foreground"
                            : "bg-black/50 text-white/90 backdrop-blur-sm border border-white/20 hover:bg-primary hover:text-primary-foreground"
                        )}
                      >
                        <Crosshair className="w-3 h-3" />
                        {isFollowing ? t("unfollowKeyword", language) : t("followKeyword", language)}
                      </button>
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
          </div>

          {/* Context body — separate card */}
          <div className="overflow-hidden">
            <div className="p-3 space-y-1.5">
              <h3 className="text-base font-bold text-foreground flex items-center gap-1.5">
                <Target className="w-4.5 h-4.5 text-primary" />
                {t("whyTrend", language)}
              </h3>
              {(() => {
                const rawCtx = language === "ko" ? (tile.contextKo || tile.context)
                  : language === "ja" ? (tile.contextJa || tile.context)
                  : language === "zh" ? (tile.contextZh || tile.context)
                  : tile.context;
                const ctx = rawCtx ? rawCtx.replace(/\[\d+\]/g, "").trim() : null;
                return ctx ? (
                  <p className="text-sm text-foreground/80 leading-relaxed">{ctx}</p>
                ) : (
                  <p className="text-xs text-muted-foreground italic">{t("noContext", language)}</p>
                );
              })()}
            </div>

            {/* Read original link */}
            {tile.sourceUrl && (
              <div className="px-3 pb-2 flex justify-end">
                <a
                  href={tile.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-primary transition-colors"
                  onClick={() => track("t2_external_link_click", { trigger_id: tile.id })}
                >
                  {t("readOriginal", language)}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </div>

          {/* Trend Momentum Indicator */}
          {(() => {
            const influence = tile.influenceIndex ?? 0;
            const ageDays = Math.max(0, Math.round((Date.now() - new Date(tile.detectedAt).getTime()) / 86400000));
            
            // Momentum label
            let momentumLabel: Record<string, string>;
            let momentumColor: string;
            let momentumIcon: string;
            
            if (influence >= 100) {
              momentumLabel = { en: "Surging", ko: "급상승 중", ja: "急上昇中", zh: "急速上升" };
              momentumColor = "text-rose-400";
              momentumIcon = "🔥";
            } else if (influence >= 30) {
              momentumLabel = { en: "Spreading", ko: "확산 중", ja: "拡散中", zh: "扩散中" };
              momentumColor = "text-amber-400";
              momentumIcon = "📈";
            } else if (influence >= 10) {
              momentumLabel = { en: "Building", ko: "형성 중", ja: "形成中", zh: "形成中" };
              momentumColor = "text-emerald-400";
              momentumIcon = "🌱";
            } else if (influence > 0) {
              momentumLabel = { en: "Steady", ko: "유지 중", ja: "安定中", zh: "稳定中" };
              momentumColor = "text-muted-foreground";
              momentumIcon = "➡️";
            } else {
              momentumLabel = { en: "Emerging", ko: "감지됨", ja: "検出済み", zh: "已检测到" };
              momentumColor = "text-muted-foreground";
              momentumIcon = "✨";
            }

            // Age label
            const ageLabel = ageDays === 0 
              ? (language === "ko" ? "오늘 감지" : "Detected today")
              : ageDays === 1
              ? (language === "ko" ? "어제 감지" : "Yesterday")
              : (language === "ko" ? `${ageDays}일 전 감지` : `${ageDays}d ago`);


            return (
              <div className="rounded-xl border border-border overflow-hidden">
                {/* Momentum header */}
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{momentumIcon}</span>
                    <div>
                      <span className={cn("text-sm font-bold", momentumColor)}>
                        {momentumLabel[language] || momentumLabel.en}
                      </span>
                      {rank != null && (
                        <span className="text-xs text-muted-foreground ml-2">#{rank}</span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">{ageLabel}</span>
                </div>
              </div>
            );
          })()}



          {/* FPMM Prediction Market */}
          <div className="rounded-xl bg-background border border-border p-4 space-y-4">
            <div className="space-y-3">
              <div className="text-center">
                <p className="text-lg font-bold text-foreground flex items-center justify-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  {t("voteRelevance", language)}
                </p>
                {(() => {
                  const expiresAt = marketData?.expires_at
                    ? new Date(marketData.expires_at).getTime()
                    : Date.now() + 24 * 60 * 60 * 1000; // daily model: 24h
                  const diff = expiresAt - Date.now();
                  if (diff <= 0) return <p className="text-xs text-muted-foreground mt-1">{language === "ko" ? "마감됨" : "Expired"}</p>;
                  const hours = Math.floor(diff / (1000 * 60 * 60));
                  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                  if (hours >= 24) {
                    const days = Math.floor(hours / 24);
                    return <p className="text-xs text-muted-foreground mt-1">{language === "ko" ? `${days}일 ${hours % 24}시간 남음` : `${days}d ${hours % 24}h left`}</p>;
                  }
                  return <p className="text-xs text-muted-foreground mt-1">{language === "ko" ? `${hours}시간 ${mins}분 남음` : `${hours}h ${mins}m left`}</p>;
                })()}
              </div>

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
                      "rounded-lg p-2.5 text-center cursor-pointer transition-all border",
                      betOutcome === key
                        ? "border-primary bg-primary/10 shadow-sm"
                        : "bg-muted border-border/30 hover:border-primary/40"
                    )}
                    onClick={() => setBetOutcome(key)}
                  >
                    <div className="text-lg">{emoji}</div>
                    <div className="text-sm font-bold text-foreground">{label}</div>
                    <div className={cn("text-sm font-black", color === "amber" ? "text-amber-600" : `text-${color}-400`)}>{multi}</div>
                    <div className="text-[9px] text-foreground mt-0.5">{threshold}</div>
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
                const outcomeEmoji: Record<string, string> = { mild: "🌱", strong: "🔥", explosive: "🚀" };
                const outcomeLabel: Record<string, string> = { mild: language === "ko" ? "소폭" : "Mild", strong: language === "ko" ? "강세" : "Strong", explosive: language === "ko" ? "폭발" : "Explosive" };
                const outcomeColor: Record<string, string> = { mild: "amber", strong: "emerald", explosive: "purple" };
                const stakes = Object.fromEntries(outcomes.map(o => [o, {
                  amount: myBets.filter((b: any) => b.outcome === o).reduce((s: number, b: any) => s + Number(b.amount), 0),
                  shares: myBets.filter((b: any) => b.outcome === o).reduce((s: number, b: any) => s + Number(b.shares), 0),
                }]));
                const totalInvested = outcomes.reduce((s, o) => s + stakes[o].amount, 0);
                return (
                  <div className="rounded-lg bg-muted/50 border border-border p-3 space-y-2">
                    <p className="text-[11px] font-bold text-foreground">{language === "ko" ? "내 포지션" : "My Position"}</p>
                    <div className="flex justify-center gap-1.5">
                      {outcomes.filter(o => stakes[o].amount > 0).map(o => (
                        <div key={o} className={cn(`rounded-md bg-${outcomeColor[o]}-500/10 border border-${outcomeColor[o]}-500/20 p-2 text-center min-w-[100px]`)}>
                          <div className={cn("text-xs font-semibold", o === "mild" ? "text-foreground" : `text-${outcomeColor[o]}-400`)}>{outcomeEmoji[o]} {outcomeLabel[o]}</div>
                          <div className={cn("text-sm font-bold", `text-${outcomeColor[o]}-400`)}>{stakes[o].amount.toLocaleString()} <span className="text-primary" style={{ filter: "hue-rotate(-10deg) saturate(1.3)" }}>💎</span></div>
                          <div className="text-[10px] text-muted-foreground">
                            {language === "ko" ? "성공시" : "If win"}{" "}
                            <span className={cn("font-semibold", `text-${outcomeColor[o]}-400`)}>
                              ×{MULTIPLIERS[o]} = {Math.round(stakes[o].amount * MULTIPLIERS[o]).toLocaleString()} <span className="text-primary" style={{ filter: "hue-rotate(-10deg) saturate(1.3)" }}>💎</span>
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="text-[10px] text-muted-foreground text-center">
                      {language === "ko" ? "총 투자" : "Total invested"}: <span className="font-bold text-foreground">{totalInvested.toLocaleString()} 💎</span>
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
                   <div className="flex flex-col items-center gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-muted-foreground whitespace-nowrap">{language === "ko" ? "배팅:" : "Bet:"}</span>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={10}
                        max={1000}
                        placeholder="10~1000"
                        value={betAmount}
                        onChange={(e) => setBetAmount(e.target.value)}
                        className="w-36 sm:w-44 h-12 sm:h-14 text-center text-base md:text-base lg:text-lg font-black [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="text-lg">💎</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {[10, 50, 100, 500, 1000].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setBetAmount(String(preset))}
                          className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-colors ${
                            betAmount === String(preset)
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                          }`}
                        >
                          {preset >= 1000 ? `${preset / 1000}K` : preset}
                        </button>
                      ))}
                    </div>
                    {user && (
                      <span className="text-[11px] font-bold text-primary whitespace-nowrap">
                        {language === "ko" ? "보유" : "Balance"}: {Number(kPoints).toLocaleString()} 💎
                      </span>
                    )}
                  </div>
                  {/* Expected return display */}
                  {betAmount && Number(betAmount) >= 10 && (
                    <div className="text-center text-teal-400 text-sm font-bold">
                      {language === "ko" ? "예상 수익" : "Expected return"}: {Math.round(Number(betAmount) * MULTIPLIERS[betOutcome]).toLocaleString()} 💎
                      <span className="text-[10px] text-muted-foreground ml-1">(×{MULTIPLIERS[betOutcome]})</span>
                    </div>
                  )}
                  <Button
                    className="w-full gap-2 py-5"
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
                    hasShareBoosted ? "text-emerald-400" : "text-primary"
                  )}>
                    {hasShareBoosted ? t("alreadyShareBoostedDone", language) : t("shareBoostReward", language)}
                  </span>
                </div>
              )}
            </div>

            {/* Related keywords */}
            {relatedKeywords && relatedKeywords.length > 0 && (
              <div className="border-t border-border/50 pt-3">
                <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                  {language === "ko" ? "연관된 트렌드" : "Related Trends"}
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {relatedKeywords.map((rk: any) => (
                    <button
                      key={rk.id}
                      className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-muted hover:bg-primary/10 hover:text-primary border border-border transition-colors"
                      onClick={() => {
                        const params = new URLSearchParams(window.location.search);
                        params.set("modal", rk.id);
                        navigate(`?${params.toString()}`, { replace: true });
                        setTimeout(() => {
                          scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                        }, 100);
                      }}
                    >
                      {language === "ko" && rk.keyword_ko ? rk.keyword_ko : rk.keyword}
                    </button>
                  ))}
                </div>
              </div>
            )}
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
