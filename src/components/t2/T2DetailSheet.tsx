import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/hooks/useAuth";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, Clock, ExternalLink, Newspaper, Trophy, Info, ChevronRight, ThumbsUp, ThumbsDown, Share2, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { TrendTile } from "./T2TrendTreemap";

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
  lifecycle: { en: "Keyword Lifecycle", ko: "키워드 수명", ja: "キーワードライフサイクル", zh: "关键词生命周期" },
  elapsed: { en: "Elapsed", ko: "경과 시간", ja: "経過時間", zh: "已用时间" },
  lifetime: { en: "Lifetime", ko: "총 수명", ja: "総寿命", zh: "总寿命" },
  peakDelay: { en: "Time to Peak", ko: "피크까지", ja: "ピークまで", zh: "达到峰值" },
  peakTime: { en: "Peaked", ko: "피크 시점", ja: "ピーク時", zh: "峰值时间" },
  notPeakedYet: { en: "Not peaked yet", ko: "아직 피크 없음", ja: "未到達", zh: "尚未达到峰值" },
  active: { en: "Active", ko: "활성", ja: "アクティブ", zh: "活跃" },
  expired: { en: "Expired", ko: "만료", ja: "期限切れ", zh: "已过期" },
  voteRelevance: { en: "Is this relevant?", ko: "이 트렌드가 관련 있나요?", ja: "関連性がありますか？", zh: "这个趋势相关吗？" },
  boostTrend: { en: "Boost this trend", ko: "이 트렌드 밀어주기", ja: "このトレンドを応援", zh: "推动这个趋势" },
  shareX: { en: "Share on X", ko: "X에 공유", ja: "Xで共有", zh: "分享到X" },
  copied: { en: "Link copied!", ko: "링크 복사됨!", ja: "リンクコピー済み！", zh: "链接已复制！" },
  loginToVote: { en: "Sign in to vote", ko: "투표하려면 로그인하세요", ja: "投票するにはログイン", zh: "登录后投票" },
  boosted: { en: "Boost shared! +5 K-Point", ko: "부스트 공유 완료! +5 K-Point", ja: "ブースト共有完了！+5 K-Point", zh: "推动分享完成！+5 K-Point" },
  readBoostReward: { en: "Read & boost +3 K-Point", ko: "읽고 밀어주기 +3 K-Point", ja: "読んで応援 +3 K-Point", zh: "阅读推动 +3 K-Point" },
  readBoosted: { en: "Boosted! +3 K-Point", ko: "밀어주기 완료! +3 K-Point", ja: "応援完了！+3 K-Point", zh: "推动完成！+3 K-Point" },
  alreadyBoosted: { en: "✓ Boosted +3P", ko: "✓ 밀어주기 완료 +3P", ja: "✓ 応援済み +3P", zh: "✓ 已推动 +3P" },
  alreadyShareBoosted: { en: "Already boosted", ko: "이미 밀어주기 완료", ja: "すでに応援済み", zh: "已推动" },
  shareBoostReward: { en: "Share & boost +5 K-Point", ko: "공유하고 밀어주기 +5 K-Point", ja: "共有して応援 +5 K-Point", zh: "分享推动 +5 K-Point" },
  alreadyShareBoostedDone: { en: "✓ Share boosted +5P", ko: "✓ 공유 밀어주기 완료 +5P", ja: "✓ 共有応援済み +5P", zh: "✓ 分享推动完成 +5P" },
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
  const { user } = useAuth();
  const queryClient = useQueryClient();




  // Vote data
  const { data: voteData } = useQuery({
    queryKey: ["t2-keyword-votes", tile?.id],
    queryFn: async () => {
      if (!tile) return { ups: 0, downs: 0, myVote: null as string | null };
      const { data: allVotes } = await supabase
        .from("ktrenz_keyword_votes" as any)
        .select("vote_type, user_id")
        .eq("trigger_id", tile.id);
      const votes = (allVotes ?? []) as any[];
      const ups = votes.filter((v: any) => v.vote_type === "up").length;
      const downs = votes.filter((v: any) => v.vote_type === "down").length;
      const myVote = user ? votes.find((v: any) => v.user_id === user.id)?.vote_type ?? null : null;
      return { ups, downs, myVote };
    },
    enabled: !!tile,
  });

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

  // Read boost check (has user already read-boosted this keyword?)
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

  const voteMutation = useMutation({
    mutationFn: async (voteType: "up" | "down") => {
      if (!user || !tile) return;
      const currentVote = voteData?.myVote;
      if (currentVote === voteType) {
        // Remove vote
        await supabase
          .from("ktrenz_keyword_votes" as any)
          .delete()
          .eq("trigger_id", tile.id)
          .eq("user_id", user.id);
      } else if (currentVote) {
        // Change vote
        await supabase
          .from("ktrenz_keyword_votes" as any)
          .update({ vote_type: voteType, updated_at: new Date().toISOString() } as any)
          .eq("trigger_id", tile.id)
          .eq("user_id", user.id);
      } else {
        // New vote
        await supabase
          .from("ktrenz_keyword_votes" as any)
          .insert({ trigger_id: tile.id, user_id: user.id, vote_type: voteType } as any);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["t2-keyword-votes", tile?.id] }),
  });

  const handleVote = (voteType: "up" | "down") => {
    if (!user) {
      toast.info(t("loginToVote", language));
      return;
    }
    voteMutation.mutate(voteType);
  };

  const handleBoost = async (platform: "x" | "copy") => {
    if (!tile) return;
    const keyword = getLocalizedKeyword(tile, language);
    const artist = getLocalizedArtistName(tile, language);
    const url = `${window.location.origin}/t2/${tile.id}`;
    const text = `🔥 ${keyword} × ${artist} is trending on K-Trendz!\n\n#KTrendz #Kpop #${artist.replace(/\s/g, "")}`;

    if (platform === "x") {
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
        await supabase.rpc("increment_points" as any, { user_id: user.id, amount: 5 });
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
    await supabase.rpc("increment_points" as any, { user_id: user.id, amount: 3 });
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
            <span className="text-sm text-muted-foreground">
              {t("by", language)} <span className="font-medium text-foreground">{getLocalizedArtistName(tile, language)}</span>
            </span>
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
                {tile.sourceImageUrl ? (
                  <a
                    href={tile.sourceUrl || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                    onClick={handleReadBoost}
                  >
                    <div className="relative aspect-[2/1] w-full overflow-hidden bg-muted">
                      <img
                        src={tile.sourceImageUrl}
                        alt={tile.sourceTitle || ""}
                        className="w-full h-full object-cover"
                        loading="lazy"
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
                  </a>
                ) : tile.sourceTitle ? (
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
                          onClick={handleReadBoost}
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
                ) : null}
              </div>
            )}

            {/* Context body */}
            <div className="p-3 space-y-1.5">
              <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Newspaper className="w-3.5 h-3.5 text-primary" />
                {t("whyTrend", language)}
              </h3>
              {(() => {
                const ctx = language === "ko" ? (tile.contextKo || tile.context)
                  : language === "ja" ? (tile.contextJa || tile.context)
                  : language === "zh" ? (tile.contextZh || tile.context)
                  : tile.context;
                return ctx ? (
                  <p className="text-sm text-muted-foreground leading-relaxed">{ctx}</p>
                ) : (
                  <p className="text-xs text-muted-foreground italic">{t("noContext", language)}</p>
                );
              })()}
            </div>

            {/* Read boost reward indicator */}
            {user && (
              <div className="px-3 pb-2 flex justify-end">
                <span className={cn(
                  "text-[10px] font-medium",
                  hasReadBoosted ? "text-emerald-400" : "text-emerald-500/70"
                )}>
                  {hasReadBoosted ? t("alreadyBoosted", language) : t("readBoostReward", language)}
                </span>
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



          {/* Vote & Boost */}
          <div className="rounded-xl bg-muted/30 border border-border p-3 space-y-3">
            {/* Vote */}
            <div>
              <h3 className="text-xs font-bold text-foreground mb-2 flex items-center gap-1.5">
                <ThumbsUp className="w-3.5 h-3.5 text-primary" />
                {t("voteRelevance", language)}
              </h3>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={voteData?.myVote === "up" ? "default" : "outline"}
                  className={cn("gap-1.5 text-xs", voteData?.myVote === "up" && "bg-green-600 hover:bg-green-700 border-green-600")}
                  onClick={() => handleVote("up")}
                  disabled={voteMutation.isPending}
                >
                  <ThumbsUp className="w-3.5 h-3.5" />
                  {voteData?.ups ?? 0}
                </Button>
                <Button
                  size="sm"
                  variant={voteData?.myVote === "down" ? "default" : "outline"}
                  className={cn("gap-1.5 text-xs", voteData?.myVote === "down" && "bg-red-600 hover:bg-red-700 border-red-600")}
                  onClick={() => handleVote("down")}
                  disabled={voteMutation.isPending}
                >
                  <ThumbsDown className="w-3.5 h-3.5" />
                  {voteData?.downs ?? 0}
                </Button>
                <div className="flex-1" />
                <span className="text-[10px] text-muted-foreground">
                  {(voteData?.ups ?? 0) + (voteData?.downs ?? 0)} votes
                </span>
              </div>
            </div>

            {/* Boost */}
            <div className="border-t border-border/50 pt-3">
              <h3 className="text-xs font-bold text-foreground mb-2 flex items-center gap-1.5">
                <Rocket className="w-3.5 h-3.5 text-primary" />
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
            className="w-full gap-2"
            onClick={() => {
              onClose();
              navigate(`/t2/${tile.id}`);
            }}
          >
            View Full Analysis
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default T2DetailSheet;
