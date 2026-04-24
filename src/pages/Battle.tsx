import { useState, useEffect, useRef, useCallback, forwardRef, type ReactNode } from "react";

const InsightLoadingText = ({ starName, t }: { starName: string; t: (k: string) => string }) => {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setIdx(p => (p + 1) % 2), 2500);
    return () => clearInterval(iv);
  }, []);
  const msgs = [
    t("battle.analyzingTrend").replace("{name}", starName),
    t("battle.pleaseWait"),
  ];
  return (
    <p className="text-sm text-muted-foreground animate-pulse text-center">{msgs[idx]}</p>
  );
};
import { createPortal } from "react-dom";
import SEO from "@/components/SEO";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Zap, Trophy, TrendingUp, Activity, Clock, ChevronLeft, ChevronRight, ExternalLink, Flame, Share2, Play, Music, Instagram, Newspaper, MessageCircle, FileText, Sprout, Rocket, ChevronDown, Ticket, Loader2, Gift, Star, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import V3Header from "@/components/v3/V3Header";
import V3Footer from "@/components/v3/V3Footer";
import { useLanguage } from "@/contexts/LanguageContext";
import { useFieldTranslation } from "@/hooks/useFieldTranslation";
import SmartImage from "@/components/SmartImage";
import { toast } from "@/hooks/use-toast";
import SettlementResultsModal, { type SettledPrediction } from "@/components/battle/SettlementResultsModal";
import TicketInfoPopup from "@/components/TicketInfoPopup";
import { cn } from "@/lib/utils";

interface B2Item {
  id: string;
  source: string;
  title: string;
  title_en: string | null;
  title_ja: string | null;
  title_zh: string | null;
  title_ko: string | null;
  description: string;
  thumbnail: string | null;
  has_thumbnail: boolean;
  engagement_score: number;
  star_id: string;
  published_at: string | null;
  url: string;
  metadata: any;
}

interface B2Run {
  id: string;
  star_id: string;
  content_score: number;
  counts: any;
  created_at: string;
  batch_id?: string;
  star?: { display_name: string; name_ko: string; image_url?: string | null };
}

type Band = "steady" | "rising" | "surge";

interface InstagramMediaAsset {
  type: "video" | "image";
  url: string;
  poster: string | null;
}

const instagramMediaCache = new Map<string, InstagramMediaAsset[]>();

const BANDS: { key: Band; label: string; range: string; icon: typeof Sprout; iconColor: string; reward: number }[] = [
  { key: "steady", label: "Steady", range: "15–30%", icon: Sprout, iconColor: "text-emerald-500", reward: 100 },
  { key: "rising", label: "Rising", range: "30–80%", icon: Flame, iconColor: "text-orange-500", reward: 300 },
  { key: "surge", label: "Surge", range: "80%+", icon: Rocket, iconColor: "text-red-500", reward: 1000 },
];

const SPOTIFY_GOAL = 9000;

/* ── All Tickets Used Celebration Modal ── */
function AllTicketsUsedModal({ open, onClose, language, userLevel, kPoints, totalTickets }: {
  open: boolean; onClose: () => void; language: string; userLevel: number; kPoints: number; totalTickets: number;
}) {
  if (!open) return null;
  const lang = (language === "ko" || language === "ja" || language === "zh") ? language : "en";

  const currentTier = userLevel >= 31 ? 3 : userLevel >= 16 ? 2 : userLevel >= 6 ? 1 : 0;
  const tierNames = [
    { en: "Beginner", ko: "초보", ja: "初心者", zh: "新手" },
    { en: "Explorer", ko: "탐색가", ja: "探索者", zh: "探索者" },
    { en: "Analyst", ko: "분석가", ja: "分析家", zh: "分析师" },
    { en: "Expert", ko: "전문가", ja: "専門家", zh: "专家" },
  ];
  const tierBattles = [3, 5, 7, 10];
  const nextTier = currentTier < 3 ? currentTier + 1 : null;

  const spotifyRemaining = Math.max(SPOTIFY_GOAL - kPoints, 0);
  const spotifyPct = Math.min((kPoints / SPOTIFY_GOAL) * 100, 100);

  const title = lang === "ko" ? "오늘의 티켓을 모두 사용했어요! 🎉"
    : lang === "ja" ? "今日のチケットを全て使いました！🎉"
    : lang === "zh" ? "今天的票已全部使用！🎉"
    : "All tickets used today! 🎉";

  const settlementLabel = lang === "ko" ? "매일 결과 발표" : lang === "ja" ? "毎日結果発表" : lang === "zh" ? "每日结果公布" : "Daily results at";
  const nextTierLabel = lang === "ko" ? "다음 등급" : lang === "ja" ? "次のランク" : lang === "zh" ? "下一等级" : "Next tier";
  const battlesLabel = lang === "ko" ? "일일 배틀 참여" : lang === "ja" ? "日次バトル参加" : lang === "zh" ? "每日战斗参与" : "Daily battles";
  const spotifyLabel = lang === "ko" ? "Spotify Premium까지" : lang === "ja" ? "Spotify Premiumまで" : lang === "zh" ? "距Spotify Premium" : "Until Spotify Premium";
  const closeLabel = lang === "ko" ? "확인" : lang === "ja" ? "確認" : lang === "zh" ? "确认" : "Got it";
  const currentLabel = lang === "ko" ? "현재 등급" : lang === "ja" ? "現在のランク" : lang === "zh" ? "当前等级" : "Current tier";
  const comeBackLabel = lang === "ko" ? "내일 다시 도전하세요!" : lang === "ja" ? "明日また挑戦！" : lang === "zh" ? "明天再来挑战！" : "Come back tomorrow!";

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="mx-4 w-full max-w-sm rounded-3xl bg-card border border-border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="bg-gradient-to-br from-primary/20 via-primary/10 to-transparent p-6 text-center relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            {[...Array(6)].map((_, i) => (
              <Sparkles key={i} className="absolute text-primary/20 animate-pulse" style={{
                width: 16, height: 16,
                top: `${15 + Math.random() * 70}%`,
                left: `${10 + Math.random() * 80}%`,
                animationDelay: `${i * 0.3}s`,
              }} />
            ))}
          </div>
          <div className="relative">
            <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-primary/10 flex items-center justify-center">
              <Trophy className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-lg font-bold text-foreground">{title}</h2>
            <p className="text-sm text-muted-foreground mt-1">{comeBackLabel}</p>
          </div>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">{currentLabel}</span>
            </div>
            <span className="text-sm font-bold text-foreground">
              {tierNames[currentTier][lang]} <span className="text-muted-foreground font-normal">(Lv.{userLevel})</span>
            </span>
          </div>
          {nextTier !== null && (
            <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <span className="text-xs text-muted-foreground">{nextTierLabel}</span>
                </div>
                <span className="text-sm font-bold text-primary">{tierNames[nextTier][lang]}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Ticket className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs text-muted-foreground">{battlesLabel}</span>
                </div>
                <span className="text-xs font-bold text-foreground flex items-center gap-1">
                  {tierBattles[currentTier]}<Ticket className="w-3 h-3 text-muted-foreground" /> → {tierBattles[nextTier]}<Ticket className="w-3 h-3 text-primary" />
                </span>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{settlementLabel}</span>
            </div>
            <span className="text-sm font-bold text-foreground">15:00 GMT</span>
          </div>
          <div className="rounded-xl bg-muted/50 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Gift className="w-4 h-4 text-emerald-500" />
                <span className="text-xs text-muted-foreground">{spotifyLabel}</span>
              </div>
              <span className="text-xs font-bold text-foreground">
                {spotifyRemaining > 0 ? `${spotifyRemaining.toLocaleString()} 💎` : "🎉"}
              </span>
            </div>
            <Progress value={spotifyPct} className="h-1.5" />
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{kPoints.toLocaleString()} 💎</span>
              <span>Spotify Premium ({SPOTIFY_GOAL.toLocaleString()} 💎)</span>
            </div>
          </div>
          <Button onClick={onClose} className="w-full mt-2" size="sm">{closeLabel}</Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ── Prediction Confirm Modal (shown after each submission) ── */
function PredictionConfirmModal({ open, onClose, language, starName, band, reward, kPoints }: {
  open: boolean; onClose: () => void; language: string; starName: string; band: Band; reward: number; kPoints: number;
}) {
  if (!open) return null;
  const lang = (language === "ko" || language === "ja" || language === "zh") ? language : "en";

  const bandInfo = BANDS.find(b => b.key === band);
  const BandIcon = bandInfo?.icon || Sprout;
  const bandLabel = band === "steady" ? { en: "Steady", ko: "안정", ja: "安定", zh: "稳定" }
    : band === "rising" ? { en: "Rising", ko: "상승", ja: "上昇", zh: "上升" }
    : { en: "Surge", ko: "급등", ja: "急騰", zh: "暴涨" };

  const title = lang === "ko" ? "예측이 등록되었어요! ✅"
    : lang === "ja" ? "予測が登録されました！✅"
    : lang === "zh" ? "预测已提交！✅"
    : "Prediction submitted! ✅";

  const artistLabel = lang === "ko" ? "선택 아티스트" : lang === "ja" ? "選択アーティスト" : lang === "zh" ? "选择的艺人" : "Your pick";
  const growthLabel = lang === "ko" ? "예측 성장대" : lang === "ja" ? "予測成長帯" : lang === "zh" ? "预测增长带" : "Growth band";
  const rewardLabel = lang === "ko" ? "적중 시 보상" : lang === "ja" ? "的中時の報酬" : lang === "zh" ? "命中奖励" : "Reward if correct";
  const settlementLabel = lang === "ko" ? "매일 결과 발표" : lang === "ja" ? "毎日結果発表" : lang === "zh" ? "每日结果公布" : "Daily results at";
  const spotifyLabel = lang === "ko" ? "Spotify Premium까지" : lang === "ja" ? "Spotify Premiumまで" : lang === "zh" ? "距Spotify Premium" : "Until Spotify Premium";
  const closeLabel = lang === "ko" ? "확인" : lang === "ja" ? "確認" : lang === "zh" ? "确认" : "Got it";

  const spotifyRemaining = Math.max(SPOTIFY_GOAL - kPoints, 0);
  const spotifyPct = Math.min((kPoints / SPOTIFY_GOAL) * 100, 100);

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="mx-4 w-full max-w-sm rounded-3xl bg-card border border-border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        {/* Header */}
        <div className="bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-5 text-center">
          <div className="w-14 h-14 mx-auto mb-2 rounded-full bg-primary/10 flex items-center justify-center">
            <Trophy className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-lg font-bold text-foreground">{title}</h2>
        </div>

        <div className="p-5 space-y-2.5">
          {/* Artist */}
          <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3">
            <span className="text-xs text-muted-foreground">{artistLabel}</span>
            <span className="text-sm font-bold text-foreground">{starName}</span>
          </div>

          {/* Growth Band */}
          <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3">
            <span className="text-xs text-muted-foreground">{growthLabel}</span>
            <div className="flex items-center gap-1.5">
              <BandIcon className={cn("w-4 h-4", bandInfo?.iconColor)} />
              <span className="text-sm font-bold text-foreground">{bandLabel[lang]} {bandInfo?.range}</span>
            </div>
          </div>

          {/* Reward */}
          <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/[0.03] p-3">
            <span className="text-xs text-muted-foreground">{rewardLabel}</span>
            <span className="text-sm font-bold text-primary">+{reward.toLocaleString()} 💎</span>
          </div>

          {/* Settlement */}
          <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{settlementLabel}</span>
            </div>
            <span className="text-sm font-bold text-foreground">15:00 GMT</span>
          </div>

          {/* Spotify */}
          <div className="rounded-xl bg-muted/50 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Gift className="w-4 h-4 text-emerald-500" />
                <span className="text-xs text-muted-foreground">{spotifyLabel}</span>
              </div>
              <span className="text-xs font-bold text-foreground">
                {spotifyRemaining > 0 ? `${spotifyRemaining.toLocaleString()} 💎` : "🎉"}
              </span>
            </div>
            <Progress value={spotifyPct} className="h-1.5" />
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{kPoints.toLocaleString()} 💎</span>
              <span>Spotify Premium ({SPOTIFY_GOAL.toLocaleString()} 💎)</span>
            </div>
          </div>

          <Button onClick={onClose} className="w-full mt-2" size="sm">{closeLabel}</Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function decodeHtml(str: string) {
  const basic = str.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&middot;/g, '·').replace(/&hellip;/g, '…').replace(/&ndash;/g, '–').replace(/&mdash;/g, '—').replace(/&lsquo;/g, '\u2018').replace(/&rsquo;/g, '\u2019').replace(/&ldquo;/g, '\u201C').replace(/&rdquo;/g, '\u201D').replace(/&nbsp;/g, ' ');
  return basic.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function sourceIcon(source: string): ReactNode {
  const cls = "w-3.5 h-3.5 text-white";
  const icon = (() => {
    switch (source) {
      case "youtube": return <Play className={cls} />;
      case "tiktok": return <Music className={cls} />;
      case "instagram": return <Instagram className={cls} />;
      case "naver_news": return <Newspaper className={cls} />;
      case "reddit": return <MessageCircle className={cls} />;
      default: return <FileText className={cls} />;
    }
  })();
  return (
    <div className="w-6 h-6 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
      {icon}
    </div>
  );
}

const InstagramEmbed = forwardRef<HTMLDivElement, { item: B2Item; starId: string }>(function InstagramEmbed(
  { item, starId },
  ref,
) {
  const cachedItems = instagramMediaCache.get(item.id) ?? null;
  const [mediaItems, setMediaItems] = useState<InstagramMediaAsset[] | null>(cachedItems);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loadingMedia, setLoadingMedia] = useState(!cachedItems);

  useEffect(() => {
    setActiveIndex(0);
  }, [item.id]);

  useEffect(() => {
    const cached = instagramMediaCache.get(item.id);
    if (cached) {
      setMediaItems(cached);
      setLoadingMedia(false);
      return;
    }

    let cancelled = false;
    setLoadingMedia(true);
    setMediaItems(null);

    supabase.functions
      .invoke("ktrenz-instagram-media", {
        body: {
          star_id: starId,
          item_url: item.url,
        },
      })
      .then(({ data, error }) => {
        if (error) throw error;

        const items = Array.isArray(data?.items)
          ? data.items.filter((entry: any) => entry?.type && entry?.url)
          : [];

        if (!items.length) {
          throw new Error("No playable Instagram media found");
        }

        instagramMediaCache.set(item.id, items);
        if (!cancelled) {
          setMediaItems(items);
        }
      })
      .catch((error) => {
        console.error("Instagram media resolve failed:", error);
        if (!cancelled) {
          setMediaItems(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingMedia(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [item.id, item.url, starId]);

  const totalItems = mediaItems?.length ?? 0;
  const activeItem = totalItems > 0 ? mediaItems?.[Math.min(activeIndex, totalItems - 1)] ?? null : null;

  if (loadingMedia) {
    return (
      <div ref={ref} className="flex w-full aspect-[4/5] items-center justify-center bg-muted">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!activeItem) {
    return item.thumbnail ? (
      <div ref={ref} className="relative w-full bg-background">
        <SmartImage src={item.thumbnail} alt={item.title} className="w-full aspect-[4/5] object-cover" />
      </div>
    ) : (
      <div ref={ref} className="flex w-full aspect-[4/5] items-center justify-center bg-muted text-xs text-muted-foreground">
        Instagram preview unavailable
      </div>
    );
  }

  const showCarouselControls = totalItems > 1;

  return (
    <div ref={ref} className="relative w-full overflow-hidden bg-background">
      <div className="relative flex w-full items-center justify-center bg-muted/30">
        {activeItem.type === "video" ? (
          <video
            key={`${item.id}-${activeIndex}`}
            src={activeItem.url}
            poster={activeItem.poster || undefined}
            className="w-full max-h-[72vh] object-contain"
            controls
            autoPlay
            muted
            playsInline
            preload="metadata"
          />
        ) : (
          <SmartImage
            src={activeItem.url}
            alt={item.title}
            className="w-full max-h-[72vh] object-contain"
          />
        )}

        {showCarouselControls && (
          <>
            <button
              type="button"
              onClick={() => setActiveIndex((prev) => (prev - 1 + totalItems) % totalItems)}
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-background/85 p-2 text-foreground shadow-sm transition hover:bg-background"
              aria-label="Previous Instagram media"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setActiveIndex((prev) => (prev + 1) % totalItems)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-background/85 p-2 text-foreground shadow-sm transition hover:bg-background"
              aria-label="Next Instagram media"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5 rounded-full bg-background/80 px-2 py-1">
              {mediaItems?.map((_, index) => (
                <button
                  key={`${item.id}-dot-${index}`}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className={cn(
                    "h-2 w-2 rounded-full transition",
                    index === activeIndex ? "bg-primary" : "bg-muted-foreground/40",
                  )}
                  aria-label={`Instagram media ${index + 1}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
});

InstagramEmbed.displayName = "InstagramEmbed";

/* ── Flip Timer ── */
function FlipCard({ digit }: { digit: string }) {
  const [display, setDisplay] = useState(digit);
  const [sliding, setSliding] = useState(false);
  const incomingRef = useRef(digit);

  useEffect(() => {
    if (digit !== display) {
      incomingRef.current = digit;
      setSliding(true);
      const t = setTimeout(() => {
        setDisplay(digit);
        setSliding(false);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [digit]);

  return (
    <div className="relative w-10 h-14 sm:w-12 sm:h-16 rounded-lg overflow-hidden shadow-sm bg-card">
      {/* Current digit — slides out downward when changing */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={sliding ? { animation: "slideDigitOut 0.3s ease-in forwards" } : undefined}
      >
        <span className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground">{display}</span>
      </div>

      {/* New digit — slides in from top */}
      {sliding && (
        <div
          className="absolute inset-0 flex items-center justify-center z-20"
          style={{ animation: "slideDigitDown 0.3s ease-out forwards" }}
        >
          <span className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground">{incomingRef.current}</span>
        </div>
      )}
    </div>
  );
}

function FlipGroup({ value }: { value: string }) {
  return (
    <div className="flex gap-1">
      {value.split("").map((d, i) => (
        <FlipCard key={i} digit={d} />
      ))}
    </div>
  );
}

type TimerPhase = "closing" | "results" | "opening";

function getTimerPhase(): { phase: TimerPhase; targetUtc: Date } {
  const now = new Date();
  const utcH = now.getUTCHours();
  const utcM = now.getUTCMinutes();
  const utcTotal = utcH * 60 + utcM;

  // UTC 20:00 = KST 05:00 betting deadline
  // UTC 00:30 = KST 09:30 settlement / results
  // UTC 03:00 = KST 12:00 new battle open

  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  if (utcTotal < 30) {
    // Before 00:30 UTC → results phase, count to 00:30
    const target = new Date(today); target.setUTCHours(0, 30, 0, 0);
    return { phase: "results", targetUtc: target };
  }
  if (utcTotal < 180) {
    // 00:30–03:00 UTC → opening phase, count to 03:00
    const target = new Date(today); target.setUTCHours(3, 0, 0, 0);
    return { phase: "opening", targetUtc: target };
  }
  if (utcTotal < 1200) {
    // 03:00–20:00 UTC → closing phase, count to 20:00 (KST 12:00–05:00)
    const target = new Date(today); target.setUTCHours(20, 0, 0, 0);
    return { phase: "closing", targetUtc: target };
  }
  // 20:00+ UTC → results phase, count to tomorrow 00:30
  const target = new Date(today); target.setUTCDate(target.getUTCDate() + 1); target.setUTCHours(0, 30, 0, 0);
  return { phase: "results", targetUtc: target };
}

const PHASE_LABELS: Record<TimerPhase, Record<string, string>> = {
  closing: { en: "Betting Closes", ko: "제출 마감", ja: "締切まで", zh: "投票截止" },
  results: { en: "Results In", ko: "결과 발표", ja: "結果発表", zh: "结果公布" },
  opening: { en: "Battle Opens", ko: "배틀 오픈", ja: "バトル開始", zh: "战斗开始" },
};

const PHASE_COLORS: Record<TimerPhase, string> = {
  closing: "text-foreground/80",
  results: "text-foreground/80",
  opening: "text-foreground/80",
};

function FlipTimer() {
  const { language } = useLanguage();
  const [time, setTime] = useState({ h: 0, m: 0, s: 0 });
  const [phase, setPhase] = useState<TimerPhase>("closing");

  useEffect(() => {
    function calc() {
      const { phase: p, targetUtc } = getTimerPhase();
      setPhase(p);
      const diff = Math.max(0, Math.floor((targetUtc.getTime() - Date.now()) / 1000));
      setTime({ h: Math.floor(diff / 3600), m: Math.floor((diff % 3600) / 60), s: diff % 60 });
    }
    calc();
    const iv = setInterval(calc, 1000);
    return () => clearInterval(iv);
  }, []);

  const pad = (n: number) => String(n).padStart(2, "0");
  const lang = (language === "ko" || language === "ja" || language === "zh") ? language : "en";

  return (
    <div className="flex flex-col items-center gap-1.5 my-0 py-[10px]">
      <span className={cn("text-[11px] font-bold tracking-wider uppercase", PHASE_COLORS[phase])}>
        {PHASE_LABELS[phase][lang]}
      </span>
      <div className="flex items-center justify-center gap-2.5 sm:gap-4">
        <FlipGroup value={pad(time.h)} />
        <span className="text-2xl font-bold text-muted-foreground">:</span>
        <FlipGroup value={pad(time.m)} />
        <span className="text-2xl font-bold text-muted-foreground">:</span>
        <FlipGroup value={pad(time.s)} />
      </div>
    </div>
  );
}

function getLocalizedTitle(item: B2Item, lang: string): string {
  if (lang === "ko" && item.title_ko) return item.title_ko;
  if (lang === "ja" && item.title_ja) return item.title_ja;
  if (lang === "zh" && item.title_zh) return item.title_zh;
  if (lang === "en" && item.title_en) return item.title_en;
  return item.title;
}

/* ── Artist Section: name bar + horizontal card carousel ── */
function ArtistSection({
  runItems,
  runId,
  starId,
  starName,
  starImage,
  contentScore,
  scoreLabel,
  isPicked,
  isSubmitted,
  onPick,
  onCardTap,
  onInsightOpen,
  disabled,
  index,
}: {
  runItems: B2Item[];
  runId: string;
  starId: string;
  starName: string;
  starImage: string | null;
  contentScore: number;
  scoreLabel: string;
  isPicked: boolean;
  isSubmitted: boolean;
  onPick: () => void;
  onCardTap: (item: B2Item) => void;
  onInsightOpen: () => void;
  disabled: boolean;
  index: number;
}) {
  const { language, t: lt } = useLanguage();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const itemCount = runItems.length;

  // Triple the full set so looping can preserve scroll direction without visible reversal
  const loopItems = itemCount > 1
    ? [...runItems, ...runItems, ...runItems]
    : runItems;
  const offset = itemCount > 1 ? itemCount : 0;

  // Initialize scroll — start at first content card
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      const firstMiddle = el.children[offset] as HTMLElement | undefined;
      if (firstMiddle) {
        const paddingLeft = parseFloat(getComputedStyle(el).paddingLeft) || 0;
        el.scrollLeft = firstMiddle.offsetLeft - paddingLeft;
      }
      setActiveIndex(0);
    });
  }, [itemCount, offset]);

  // Track active index and loop only after scroll settles
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || itemCount <= 1) return;

    let scrollTimer: ReturnType<typeof setTimeout> | null = null;

    const updateActiveIndex = () => {
      const children = Array.from(el.children) as HTMLElement[];
      if (children.length === 0) return;

      const containerCenter = el.scrollLeft + el.clientWidth / 2;
      let closest = offset;
      let minDist = Infinity;

      children.forEach((child, i) => {
        const childCenter = child.offsetLeft + child.offsetWidth / 2;
        const dist = Math.abs(childCenter - containerCenter);
        if (dist < minDist) {
          minDist = dist;
          closest = i;
        }
      });

      setActiveIndex(((closest - offset) % itemCount + itemCount) % itemCount);
    };

    const settleLoop = () => {
      const children = Array.from(el.children) as HTMLElement[];
      const middleStart = children[offset] as HTMLElement | undefined;
      const thirdStart = children[offset + itemCount] as HTMLElement | undefined;

      if (!middleStart || !thirdStart) return;

      const setWidth = thirdStart.offsetLeft - middleStart.offsetLeft;
      if (setWidth <= 0) return;

      const needsJump =
        el.scrollLeft >= thirdStart.offsetLeft ||
        el.scrollLeft < middleStart.offsetLeft;

      if (needsJump) {
        // Disable snap to prevent the browser from animating the jump
        el.style.scrollSnapType = "none";

        if (el.scrollLeft >= thirdStart.offsetLeft) {
          el.scrollLeft -= setWidth;
        } else {
          el.scrollLeft += setWidth;
        }

        // Re-enable snap after the paint
        requestAnimationFrame(() => {
          el.style.scrollSnapType = "";
        });
      }

      updateActiveIndex();
    };

    const handleScroll = () => {
      updateActiveIndex();

      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(settleLoop, 280);
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", handleScroll);
      if (scrollTimer) clearTimeout(scrollTimer);
    };
  }, [itemCount, offset]);

  const scrollToIndex = (i: number) => {
    const el = scrollRef.current;
    if (!el) return;

    const child = el.children[i + offset] as HTMLElement | undefined;
    if (child) {
      child.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  };

  return (
    <div className="space-y-2">
      {/* Trend card (A/B) with integrated momentum signals */}
      {(() => {
        const totalEng = runItems.reduce((sum, it) => sum + (it.engagement_score || 0), 0);
        const sourceCount = new Set(runItems.map((it) => it.source)).size;
        const formatEng = (n: number) => {
          if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
          if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
          return String(Math.round(n));
        };
        return (
          <div className="max-w-sm mx-auto sm:max-w-[80%] sm:mx-auto px-2 sm:px-0 mb-1">
            <button
              onClick={onInsightOpen}
              className={cn(
                "group w-full rounded-2xl bg-card text-left overflow-hidden transition-all shadow-sm",
                "hover:shadow-md hover:bg-muted/40",
                isSubmitted && isPicked && "ring-2 ring-primary bg-primary/5 hover:bg-primary/5",
                !isSubmitted && isPicked && "ring-1 ring-primary/60 bg-primary/[0.03] hover:bg-primary/[0.03]",
              )}
            >
              {/* Header row: A/B badge + name + action hint */}
              <div className="flex items-center gap-3 px-4 pt-3 pb-2.5">
                <div
                  className={cn(
                    "shrink-0 w-9 h-9 rounded-xl grid place-items-center font-extrabold text-sm transition-colors",
                    isPicked ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  {index === 0 ? "A" : "B"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground leading-tight">
                    {lt("battle.labelTrendBy")}
                  </div>
                  <div
                    className={cn(
                      "text-base font-bold truncate leading-tight mt-0.5",
                      isPicked ? "text-primary" : "text-foreground",
                    )}
                  >
                    {starName}
                  </div>
                </div>
                {isSubmitted && isPicked ? (
                  <span className="shrink-0 inline-flex items-center gap-1 text-xs font-bold text-primary">
                    <Trophy className="w-3.5 h-3.5" />
                    {lt("battle.predicted")}
                  </span>
                ) : (
                  <span className="shrink-0 inline-flex items-center gap-0.5 text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                    {lt("battle.viewTrend")}
                    <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                )}
              </div>

              {/* Signal row — same white as header, separated by a subtle inset shadow */}
              <div className="flex items-center justify-between gap-2 px-4 py-2.5 text-[11px] bg-card shadow-[inset_0_4px_8px_-4px_rgba(0,0,0,0.06)]">
                <span className="inline-flex items-center gap-1">
                  <TrendingUp className="w-3 h-3 text-muted-foreground" />
                  <span className="font-bold text-foreground">{contentScore.toFixed(0)}</span>
                  <span className="text-muted-foreground opacity-70">{scoreLabel}</span>
                </span>
                {totalEng > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Activity className="w-3 h-3 text-muted-foreground" />
                    <span className="font-bold text-foreground">{formatEng(totalEng)}</span>
                    <span className="text-muted-foreground opacity-70">{lt("battle.signalEngagement")}</span>
                  </span>
                )}
                {sourceCount > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <span className="font-bold text-foreground">{sourceCount}</span>
                    <span className="text-muted-foreground opacity-70">{lt("battle.signalSources")}</span>
                  </span>
                )}
              </div>
            </button>
          </div>
        );
      })()}

      {/* Horizontal card carousel */}
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-1 max-w-sm mx-auto sm:max-w-[80%] sm:mx-auto px-2"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {loopItems.map((item, loopIdx) => (
          <div
            key={`${item.id}-loop-${loopIdx}`}
            className="snap-start flex-shrink-0 w-[85%] sm:w-72 lg:w-80 cursor-pointer"
            onClick={() => onCardTap(item)}
          >
            <div className="rounded-xl overflow-hidden bg-card shadow-sm">
              {/* Square image */}
              <div className="relative aspect-[4/3] bg-muted">
                {item.thumbnail ? (
                  <SmartImage
                    src={item.thumbnail}
                    alt={item.title}
                    className="w-full h-full object-cover object-center"
                    fallbackSrc={starImage}
                    fallbackClassName="w-full h-full object-contain p-4 opacity-40"
                  />
                ) : starImage ? (
                  <SmartImage src={starImage} alt="" className="w-full h-full object-contain p-4 opacity-40" />
                ) : (
                  <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground text-[10px]">No image</div>
                )}
                {/* Subtle bottom gradient for source icon contrast */}
                <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
                <div className="absolute top-1.5 right-1.5">
                  {sourceIcon(item.source)}
                </div>
              </div>
              {/* Content area */}
              <div className="p-3 min-h-[40px] flex items-center bg-muted/30">
                <p className="text-xs font-medium text-muted-foreground leading-snug line-clamp-1">
                  {decodeHtml(getLocalizedTitle(item, language))}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Carousel indicators */}
      {itemCount > 1 && (
        <div className="flex items-center justify-center gap-1.5 pt-1">
          {runItems.map((_, i) => (
            <button
              key={i}
              onClick={() => scrollToIndex(i)}
              className="relative p-0.5"
              aria-label={`Slide ${i + 1}`}
            >
              <span
                className={`block rounded-full transition-all duration-300 ease-out ${
                  i === activeIndex
                    ? "w-5 h-1.5 bg-primary"
                    : "w-1.5 h-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                }`}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Types for battle pairs ── */
interface BattlePair {
  runs: B2Run[];
  items: Record<string, B2Item[]>;
}

interface Prediction {
  id?: string;
  pickedRunId: string;
  opponentRunId: string;
  band: Band;
  pickedStarName: string;
  opponentStarName: string;
  status: string;
  created_at: string;
  battle_date?: string;
  reward_amount?: number;
}

/* ── Cache (in-memory + localStorage persistence) ── */
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const CACHE_KEY = "ktrenz-battle-cache-v1";

interface BattleCacheShape {
  data: BattlePair[] | null;
  ts: number;
  ticketInfo: any;
  ticketTs: number;
  battleDate: string | null;
}

const battleCache: BattleCacheShape = {
  data: null,
  ts: 0,
  ticketInfo: null,
  ticketTs: 0,
  battleDate: null,
};

// Hydrate from localStorage on module load — survives tab close within TTL.
if (typeof window !== "undefined") {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<BattleCacheShape>;
      const now = Date.now();
      if (parsed.data && parsed.ts && now - parsed.ts < CACHE_TTL) {
        battleCache.data = parsed.data as BattlePair[];
        battleCache.ts = parsed.ts;
        battleCache.battleDate = parsed.battleDate ?? null;
      }
      if (parsed.ticketInfo && parsed.ticketTs && now - parsed.ticketTs < CACHE_TTL) {
        battleCache.ticketInfo = parsed.ticketInfo;
        battleCache.ticketTs = parsed.ticketTs;
      }
    }
  } catch {}
}

function persistBattleCache() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        data: battleCache.data,
        ts: battleCache.ts,
        ticketInfo: battleCache.ticketInfo,
        ticketTs: battleCache.ticketTs,
        battleDate: battleCache.battleDate,
      }),
    );
  } catch {}
}

/* ── Main Battle Page ── */
export default function Battle() {
  const navigate = useNavigate();
  const { user, profile, kPoints } = useAuth();
  const { t: globalT, language } = useLanguage();
  const t = (key: string) => globalT(`battle.${key}`);
  const { translateIfNeeded } = useFieldTranslation();

  const userLevel = profile?.current_level ?? 1;

  const [battlePairs, setBattlePairs] = useState<BattlePair[]>([]);
  const [pairStates, setPairStates] = useState<Record<number, { pickedRunId: string | null; selectedBand: Band | null; submitted: boolean; hotVotes: Set<string> }>>({});
  const [loading, setLoading] = useState(true);
  const [drawerItem, setDrawerItem] = useState<B2Item | null>(null);
  const [drawerPairIndex, setDrawerPairIndex] = useState<number>(0);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [ticketInfo, setTicketInfo] = useState<{ remaining: number; total: number; used: number } | null>(null);
  const [showTicketInfo, setShowTicketInfo] = useState(false);
  const [battleFilter, setBattleFilter] = useState<"live" | "settled" | "myBets">("live");
  const [collapsedPairs, setCollapsedPairs] = useState<Set<number>>(new Set());
  const [insightDrawer, setInsightDrawer] = useState<{ open: boolean; runId: string; starId: string; starName: string } | null>(null);
  const [insightData, setInsightData] = useState<Record<string, { headline?: string; bullets?: string[]; lifestyle?: { category: string; text: string }[]; vibe?: string }>>({}); // keyed by `runId-starId`
  const [insightLoading, setInsightLoading] = useState(false);
  const [showAllUsedModal, setShowAllUsedModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ starName: string; band: Band; reward: number } | null>(null);
  const [settlementResults, setSettlementResults] = useState<SettledPrediction[]>([]);
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [historyPredictions, setHistoryPredictions] = useState<Prediction[]>([]);
  const [showFirstAnalyzerModal, setShowFirstAnalyzerModal] = useState(false);
  const [settledBattleResults, setSettledBattleResults] = useState<{ starA: string; starB: string; growthA: number; growthB: number; battleDate: string }[]>([]);
  const [activePairIdx, setActivePairIdx] = useState<number | null>(null);
  const pairRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const remainingTickets = ticketInfo?.remaining ?? 3;
  const totalTickets = ticketInfo?.total ?? 3;
  const myBetMap = new Map<string, Prediction>();
  [...predictions, ...historyPredictions].forEach((pred) => {
    const key = `${pred.id || `${pred.pickedRunId}:${pred.opponentRunId}:${pred.band}:${pred.battle_date || ''}`}`;
    if (!myBetMap.has(key)) myBetMap.set(key, pred);
  });
  const myBetPredictions = Array.from(myBetMap.values()).sort((a, b) =>
    new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  );
  const settledHistoryPredictions = myBetPredictions.filter((pred) => pred.status === "won" || pred.status === "lost");

  function getPairState(idx: number) {
    return pairStates[idx] || { pickedRunId: null, selectedBand: null, submitted: false, hotVotes: new Set<string>() };
  }

  function updatePairState(idx: number, updates: Partial<{ pickedRunId: string | null; selectedBand: Band | null; submitted: boolean; hotVotes: Set<string> }>) {
    setPairStates(prev => ({ ...prev, [idx]: { ...getPairState(idx), ...updates } }));
  }

  function getHotBonus(pairIdx: number, runId: string): number {
    const pair = battlePairs[pairIdx];
    if (!pair) return 0;
    const runItems = pair.items[runId] || [];
    const hv = getPairState(pairIdx).hotVotes;
    const count = runItems.filter((i) => hv.has(i.id)).length;
    return count * 0.2;
  }

  async function openInsightDrawer(runId: string, starId: string, starName: string) {
    const key = `${runId}-${starId}-${language}`;
    setInsightDrawer({ open: true, runId, starId, starName });

    if (insightData[key]) return;

    setInsightLoading(true);
    try {
      const { data: cached } = await supabase
        .from("ktrenz_b2_insights")
        .select("insight_data")
        .eq("run_id", runId)
        .eq("star_id", starId)
        .eq("language", language)
        .maybeSingle();

      if (cached?.insight_data) {
        setInsightData(prev => ({ ...prev, [key]: cached.insight_data as any }));
        setInsightLoading(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("ktrenz-battle-insight", {
        body: { run_id: runId, star_id: starId, star_name: starName, language },
      });
      if (error) throw error;
      if (data?.insight_data) {
        setInsightData(prev => ({ ...prev, [key]: data.insight_data }));
      }
      if (data?.first_analyzer) {
        setShowFirstAnalyzerModal(true);
      }
    } catch (e) {
      console.error("Insight generation failed:", e);
      toast({ title: "Analysis unavailable", description: "Please try again later.", variant: "destructive" });
    } finally {
      setInsightLoading(false);
    }
  }

  function toggleHot(pairIdx: number, itemId: string) {
    const state = getPairState(pairIdx);
    const next = new Set(state.hotVotes);
    if (next.has(itemId)) next.delete(itemId);
    else next.add(itemId);
    updatePairState(pairIdx, { hotVotes: next });
  }

  // Load ticket info (cached)
  const loadTickets = useCallback(async () => {
    if (battleCache.ticketInfo && Date.now() - battleCache.ticketTs < CACHE_TTL) {
      setTicketInfo(battleCache.ticketInfo);
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.rpc("ktrenz_get_prediction_tickets" as any, { _user_id: user.id });
      const parsed = typeof data === "string" ? JSON.parse(data) : data;
      if (parsed) {
        battleCache.ticketInfo = parsed;
        battleCache.ticketTs = Date.now();
        persistBattleCache();
        setTicketInfo(parsed);
      }
    }
  }, []);

  async function buildBattlePairsForBatch(batchId: string): Promise<BattlePair[]> {
    const { data: candidateRuns } = await (supabase.from("ktrenz_b2_runs") as any)
      .select("id, star_id, content_score, counts, created_at, batch_id")
      .eq("batch_id", batchId)
      .eq("search_round", 1)
      .order("content_score", { ascending: false })
      .limit(40);

    if (!candidateRuns || candidateRuns.length < 2) return [];

    const allRuns = candidateRuns as B2Run[];
    const starBest = new Map<string, B2Run>();
    allRuns.forEach((r) => {
      if (!starBest.has(r.star_id)) {
        starBest.set(r.star_id, r);
      }
    });

    const bestRuns = Array.from(starBest.values()).sort((a, b) => b.content_score - a.content_score);
    if (bestRuns.length < 2) return [];

    const starIds = bestRuns.map((r) => r.star_id);
    const { data: starsData } = await supabase
      .from("ktrenz_stars")
      .select("id, display_name, name_ko, image_url")
      .in("id", starIds);

    const starMap = new Map((starsData || []).map((s: any) => [s.id, s]));
    const enrichedRuns = bestRuns.map((r: any) => ({ ...r, star: starMap.get(r.star_id) }));

    const pairs: BattlePair[] = [];
    for (let i = 0; i + 1 < enrichedRuns.length && pairs.length < 10; i += 2) {
      const pairRuns = [enrichedRuns[i], enrichedRuns[i + 1]];
      pairs.push({ runs: pairRuns, items: {} });
    }

    const allRunIds = pairs.flatMap((p) => p.runs.map((r) => r.id));
    if (allRunIds.length > 0) {
      // Server-side dedup via RPC (see migration 20260424180000_b2_items_dedup.sql).
      // DISTINCT ON (run_id, dedup_key) keeps only the highest-engagement
      // representative of each article cluster. Fallback to plain select if the
      // RPC hasn't been applied yet (e.g., dev against unmigrated DB).
      const { data: rpcItems, error: rpcErr } = await supabase.rpc(
        "ktrenz_get_battle_items_deduped" as any,
        { p_run_ids: allRunIds },
      );
      let allItems: any[] | null = rpcErr ? null : (rpcItems as any[] | null);
      if (!allItems) {
        const { data } = await supabase
          .from("ktrenz_b2_items")
          .select("id, source, title, title_en, title_ja, title_zh, title_ko, description, url, thumbnail, has_thumbnail, engagement_score, star_id, published_at, metadata, run_id")
          .in("run_id", allRunIds)
          .eq("has_thumbnail", true)
          .not("source", "eq", "naver_blog")
          .order("engagement_score", { ascending: false });
        allItems = data as any[] | null;
      }

      const itemsByRun = new Map<string, B2Item[]>();
      (allItems || []).forEach((it: any) => {
        const arr = itemsByRun.get(it.run_id) || [];
        arr.push(it as B2Item);
        itemsByRun.set(it.run_id, arr);
      });

      pairs.forEach((pair) => {
        pair.runs.forEach((run) => {
          const items = itemsByRun.get(run.id) || [];
          pair.items[run.id] = items
            .sort((a, b) => (b.engagement_score || 0) - (a.engagement_score || 0))
            .slice(0, 8);
        });
      });
    }

    return pairs.filter(pair => {
      const runIds = pair.runs.map(r => r.id);
      return runIds.every(id => (pair.items[id]?.length ?? 0) >= 3);
    });
  }

  async function restoreSubmittedState(pairs: BattlePair[], battleDate?: string | null) {
    setPairStates({});
    setPredictions([]);
    setCollapsedPairs(new Set());

    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser || pairs.length === 0 || !battleDate) return;

    const { data: existingPreds } = await supabase
      .from("b2_predictions")
      .select("picked_run_id, opponent_run_id, band, status, settled_at, created_at")
      .eq("user_id", currentUser.id)
      .eq("battle_date", battleDate);

    if (!existingPreds || existingPreds.length === 0) return;

    const restoredStates: Record<number, { pickedRunId: string | null; selectedBand: Band | null; submitted: boolean; hotVotes: Set<string> }> = {};
    pairs.forEach((pair, idx) => {
      const pairRunIds = new Set(pair.runs.map(r => r.id));
      const match = existingPreds.find(p => pairRunIds.has(p.picked_run_id) || pairRunIds.has(p.opponent_run_id));
      if (match) {
        restoredStates[idx] = {
          pickedRunId: match.picked_run_id,
          selectedBand: match.band as Band,
          submitted: true,
          hotVotes: new Set<string>(),
        };
      }
    });

    if (Object.keys(restoredStates).length > 0) {
      setPairStates(restoredStates);
      setCollapsedPairs(new Set(Object.keys(restoredStates).map(Number)));
    }

    const runIds = [...new Set(existingPreds.flatMap((p: any) => [p.picked_run_id, p.opponent_run_id]))];
    const { data: runs } = await (supabase.from("ktrenz_b2_runs") as any)
      .select("id, star_id")
      .in("id", runIds);
    const starIds = [...new Set((runs || []).map((r: any) => r.star_id))];
    const { data: stars } = await (supabase.from("ktrenz_stars") as any)
      .select("id, display_name")
      .in("id", starIds);

    const runToStar = new Map<string, string>();
    (runs || []).forEach((r: any) => {
      const star = (stars || []).find((s: any) => s.id === r.star_id);
      if (star) runToStar.set(r.id, star.display_name);
    });

    const restoredPredictions: Prediction[] = existingPreds.map((p: any) => ({
      pickedRunId: p.picked_run_id,
      opponentRunId: p.opponent_run_id,
      band: p.band as Band,
      pickedStarName: runToStar.get(p.picked_run_id) || "Unknown",
      opponentStarName: runToStar.get(p.opponent_run_id) || "Unknown",
      status: p.status || "pending",
      created_at: p.created_at || new Date().toISOString(),
    }));

    setPredictions(restoredPredictions);
  }

  useEffect(() => {
    loadBattleData(); loadTickets(); loadUnseenSettlements(); loadHistoryPredictions(); loadSettledBattleResults();
    // Safety timeout: force loading=false after 8s to prevent infinite spinner
    const safetyTimeout = setTimeout(() => setLoading(false), 8_000);
    return () => clearTimeout(safetyTimeout);
  }, [loadTickets]);

  // Auto-refresh every 60s to detect battle status changes
  useEffect(() => {
    const iv = setInterval(() => { battleCache.ts = 0; loadBattleData(); loadHistoryPredictions(); }, 60_000);
    return () => clearInterval(iv);
  }, []);

  // Track which pair is most-visible in viewport → powers BottomCommitBar
  useEffect(() => {
    if (battleFilter !== "live" || battlePairs.length === 0) {
      setActivePairIdx(null);
      return;
    }
    // Default to first pair so bar shows immediately — observer refines as user scrolls.
    setActivePairIdx((prev) => (prev === null || prev >= battlePairs.length ? 0 : prev));

    // Delay observer setup slightly so refs are fully wired after initial layout.
    const setupTimer = setTimeout(() => {
      const observer = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((e) => e.isIntersecting)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
          if (visible.length > 0) {
            const idx = Number((visible[0].target as HTMLElement).dataset.pairIdx);
            if (!Number.isNaN(idx)) setActivePairIdx(idx);
          }
        },
        { threshold: [0.05, 0.25, 0.5, 0.75], rootMargin: "-64px 0px -180px 0px" },
      );
      Object.values(pairRefs.current).forEach((el) => {
        if (el) observer.observe(el);
      });
      (setupTimer as any)._observer = observer;
    }, 50);

    return () => {
      clearTimeout(setupTimer);
      const obs = (setupTimer as any)._observer as IntersectionObserver | undefined;
      obs?.disconnect();
    };
  }, [battlePairs.length, battleFilter]);

  async function loadHistoryPredictions() {
    const { data: { user: u } } = await supabase.auth.getUser();
    if (!u) return;
    const { data: allPreds } = await supabase
      .from("b2_predictions")
      .select("id, picked_run_id, opponent_run_id, band, status, reward_amount, battle_date, created_at")
      .eq("user_id", u.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (!allPreds || allPreds.length === 0) { setHistoryPredictions([]); return; }
    const runIds = [...new Set(allPreds.flatMap(p => [p.picked_run_id, p.opponent_run_id]))];
    const allRuns: any[] = [];
    for (let i = 0; i < runIds.length; i += 50) {
      const { data: runs } = await (supabase.from("ktrenz_b2_runs") as any)
        .select("id, star_id").in("id", runIds.slice(i, i + 50));
      if (runs) allRuns.push(...runs);
    }
    const starIds = [...new Set(allRuns.map((r: any) => r.star_id))];
    const { data: stars } = await (supabase.from("ktrenz_stars") as any)
      .select("id, display_name").in("id", starIds);
    const runToStar = new Map<string, string>();
    allRuns.forEach((r: any) => {
      const star = (stars || []).find((s: any) => s.id === r.star_id);
      if (star) runToStar.set(r.id, star.display_name);
    });
    setHistoryPredictions(allPreds.map((p: any) => ({
      id: p.id, pickedRunId: p.picked_run_id, opponentRunId: p.opponent_run_id,
      band: p.band as Band, pickedStarName: runToStar.get(p.picked_run_id) || "Unknown",
      opponentStarName: runToStar.get(p.opponent_run_id) || "Unknown",
      status: p.status || "pending", created_at: p.created_at, battle_date: p.battle_date,
      reward_amount: p.reward_amount,
    })));
  }

  async function loadSettledBattleResults() {
    // Get recent settled battles
    const { data: settledBattles } = await (supabase.from("ktrenz_b2_battles") as any)
      .select("batch_id, battle_date, status")
      .eq("status", "settled")
      .order("battle_date", { ascending: false })
      .limit(3);
    if (!settledBattles?.length) { setSettledBattleResults([]); return; }

    const perBattle = await Promise.all(settledBattles.map(async (battle: any) => {
      const [{ data: r1Runs }, { data: r2Runs }] = await Promise.all([
        (supabase.from("ktrenz_b2_runs") as any)
          .select("id, star_id, content_score")
          .eq("batch_id", battle.batch_id)
          .eq("search_round", 1)
          .order("content_score", { ascending: false })
          .limit(40),
        (supabase.from("ktrenz_b2_runs") as any)
          .select("star_id, content_score")
          .eq("batch_id", battle.batch_id)
          .eq("search_round", 2)
          .limit(100),
      ]);
      if (!r1Runs?.length) return [];

      const starBest = new Map<string, any>();
      r1Runs.forEach((r: any) => { if (!starBest.has(r.star_id)) starBest.set(r.star_id, r); });
      const bestRuns = Array.from(starBest.values()).sort((a: any, b: any) => b.content_score - a.content_score);

      const r2Map = new Map<string, number>();
      (r2Runs || []).forEach((r: any) => {
        const existing = r2Map.get(r.star_id);
        if (!existing || r.content_score > existing) r2Map.set(r.star_id, r.content_score);
      });

      const starIds = bestRuns.map((r: any) => r.star_id);
      const { data: stars } = await supabase.from("ktrenz_stars").select("id, display_name").in("id", starIds);
      const starNameMap = new Map((stars || []).map((s: any) => [s.id, s.display_name]));

      const battleResults: { starA: string; starB: string; growthA: number; growthB: number; battleDate: string }[] = [];
      for (let i = 0; i + 1 < bestRuns.length; i += 2) {
        const a = bestRuns[i];
        const b = bestRuns[i + 1];
        const r1A = a.content_score;
        const r1B = b.content_score;
        const r2A = r2Map.get(a.star_id) ?? r1A;
        const r2B = r2Map.get(b.star_id) ?? r1B;
        const growthA = r1A > 0 ? Math.round(((r2A - r1A) / r1A) * 100) : 0;
        const growthB = r1B > 0 ? Math.round(((r2B - r1B) / r1B) * 100) : 0;
        battleResults.push({
          starA: starNameMap.get(a.star_id) || "Unknown",
          starB: starNameMap.get(b.star_id) || "Unknown",
          growthA, growthB,
          battleDate: battle.battle_date,
        });
      }
      return battleResults;
    }));
    setSettledBattleResults(perBattle.flat());
  }

  async function loadUnseenSettlements() {
    const { data: { user: u } } = await supabase.auth.getUser();
    if (!u) return;
    const { data: unseen } = await supabase
      .from("b2_predictions")
      .select("id, picked_run_id, opponent_run_id, band, status, reward_amount, picked_growth, opponent_growth, settled_at")
      .eq("user_id", u.id)
      .in("status", ["won", "lost"])
      .is("seen_at", null)
      .order("settled_at", { ascending: false })
      .limit(20);
    if (!unseen || unseen.length === 0) return;

    // Resolve star names from run IDs
    const runIds = [...new Set(unseen.flatMap(p => [p.picked_run_id, p.opponent_run_id]))];
    const { data: runs } = await (supabase.from("ktrenz_b2_runs") as any)
      .select("id, star_id")
      .in("id", runIds);
    const starIds = [...new Set((runs || []).map((r: any) => r.star_id))];
    const { data: stars } = await (supabase.from("ktrenz_stars") as any)
      .select("id, display_name")
      .in("id", starIds);
    const runToStar = new Map<string, string>();
    (runs || []).forEach((r: any) => {
      const star = (stars || []).find((s: any) => s.id === r.star_id);
      if (star) runToStar.set(r.id, star.display_name);
    });

    const mapped: SettledPrediction[] = unseen.map(p => ({
      id: p.id,
      picked_star_name: runToStar.get(p.picked_run_id) || "Unknown",
      opponent_star_name: runToStar.get(p.opponent_run_id) || "Unknown",
      band: p.band as Band,
      status: p.status as "won" | "lost",
      reward_amount: p.reward_amount || 0,
      picked_growth: p.picked_growth,
      opponent_growth: p.opponent_growth,
      settled_at: p.settled_at,
    }));
    setSettlementResults(mapped);
    setTimeout(() => setShowSettlementModal(true), 500);
  }

  async function loadBattleData(skipTranslation = false) {
   try {
    const { phase } = getTimerPhase();

    // Use cached data if fresh for the same visible battle date window
    if (battleCache.data && Date.now() - battleCache.ts < CACHE_TTL) {
      setBattlePairs(battleCache.data);
      await restoreSubmittedState(battleCache.data, battleCache.battleDate);
      setLoading(false);
      return;
    }

    const { data: recentBattles } = await (supabase
      .from("ktrenz_b2_battles") as any)
      .select("batch_id, battle_date, status")
      .order("battle_date", { ascending: false })
      .limit(5);

    // Always try most recent battles first — the fallback loop will skip
    // batches that don't have valid pairs regardless of phase.
    const orderedBattles = [...(recentBattles || [])];

    let latestBattle: any = null;
    let validPairs: BattlePair[] = [];

    for (const battle of orderedBattles) {
      const candidatePairs = await buildBattlePairsForBatch(battle.batch_id);
      if (candidatePairs.length > 0) {
        latestBattle = battle;
        validPairs = candidatePairs;
        break;
      }
    }

    if (validPairs.length === 0) {
      setBattlePairs([]);
      await restoreSubmittedState([], null);
      setLoading(false);
      return;
    }

    if (!skipTranslation) {
      const allItems = validPairs.flatMap(p => Object.values(p.items).flat());
      if (allItems.length > 0) {
        translateIfNeeded("ktrenz_b2_items", "title", allItems, () => {
          battleCache.ts = 0;
          loadBattleData(true);
        });
      }
    }

    setBattlePairs(validPairs);
    battleCache.data = validPairs;
    battleCache.battleDate = latestBattle?.battle_date || null;
    battleCache.ts = Date.now();
    persistBattleCache();

    await restoreSubmittedState(validPairs, battleCache.battleDate);

    // Fire-and-forget thumbnail preload — no await, so render isn't blocked.
    // Browsers will stream images in place as they arrive.
    const imagesToPreload = validPairs.flatMap(p =>
      p.runs.map(r => {
        const items = p.items[r.id] || [];
        return items[0]?.thumbnail || r.star?.image_url || null;
      })
    ).filter(Boolean) as string[];
    imagesToPreload.forEach((src) => {
      const img = new Image();
      img.src = src;
    });

    setLoading(false);
   } catch (err) {
    console.error("loadBattleData error:", err);
    setLoading(false);
   }
  }

  function handlePick(pairIdx: number, runId: string) {
    const state = getPairState(pairIdx);
    if (state.submitted) return;
    if (!user) {
      toast({ title: "Please log in to participate.", variant: "destructive" });
      navigate("/login");
      return;
    }
    // If all tickets used, show tier info instead of allowing pick
    if (remainingTickets <= 0) {
      setShowTicketInfo(true);
      return;
    }
    updatePairState(pairIdx, { pickedRunId: state.pickedRunId === runId ? null : runId, selectedBand: null });
  }

  function handleBandSelect(pairIdx: number, band: Band) {
    const state = getPairState(pairIdx);
    if (state.submitted || !state.pickedRunId) return;
    updatePairState(pairIdx, { selectedBand: state.selectedBand === band ? null : band });
  }

  async function handleSubmit(pairIdx: number) {
    // Block submissions outside the "closing" phase (KST 12:00–00:00)
    const { phase } = getTimerPhase();
    if (phase !== "closing") {
      const closedMsg = language === "ko" ? "제출 마감 시간이 지났습니다. 다음 배틀을 기다려주세요!"
        : language === "ja" ? "受付時間が終了しました。次のバトルをお待ちください！"
        : language === "zh" ? "提交时间已过，请等待下一场战斗！"
        : "Submission period has ended. Please wait for the next battle!";
      toast({ title: closedMsg, variant: "destructive" });
      return;
    }
    const pair = battlePairs[pairIdx];
    const state = getPairState(pairIdx);
    if (!state.pickedRunId || !state.selectedBand || !pair) return;
    const pairRuns = pair.runs;
    const opponentRun = pairRuns.find((r) => r.id !== state.pickedRunId);
    if (!opponentRun) return;

    // --- Ticket validation BEFORE submission ---
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: ticketResult, error: ticketError } = await supabase.rpc("ktrenz_use_prediction_ticket" as any, { _user_id: user.id });
    if (ticketError) {
      console.error("[Battle] ticket RPC error:", ticketError);
      toast({ title: language === "ko" ? "티켓 처리 중 오류가 발생했습니다." : "Ticket processing error.", variant: "destructive" });
      return;
    }
    const ticket = typeof ticketResult === "string" ? JSON.parse(ticketResult) : ticketResult;
    if (!ticket?.success) {
      // No tickets remaining → show ticket exhaustion modal
      battleCache.ticketTs = 0;
      await loadTickets();
      setShowAllUsedModal(true);
      return;
    }

    // Ticket consumed successfully — proceed with prediction
    battleCache.ticketTs = 0;
    await loadTickets();

    const prediction: Prediction = {
      pickedRunId: state.pickedRunId,
      opponentRunId: opponentRun.id,
      band: state.selectedBand,
      pickedStarName: pairRuns.find((r) => r.id === state.pickedRunId)?.star?.display_name || "Unknown",
      opponentStarName: opponentRun.star?.display_name || "Unknown",
      status: "pending",
      created_at: new Date().toISOString(),
    };

    setPredictions((prev) => [...prev, prediction]);
    updatePairState(pairIdx, { submitted: true });
    setCollapsedPairs(prev => new Set(prev).add(pairIdx));

    const bandInfo = BANDS.find(b => b.key === state.selectedBand);
    setConfirmModal({
      starName: prediction.pickedStarName,
      band: state.selectedBand,
      reward: bandInfo?.reward || 100,
    });

    // Check if all tickets used → show celebration
    if (ticket.remaining === 0) {
      setTimeout(() => setShowAllUsedModal(true), 600);
    }

    // Insert prediction record
    try {
      const { error: predError } = await supabase.from("b2_predictions").insert({
        user_id: user.id,
        picked_run_id: state.pickedRunId,
        opponent_run_id: opponentRun.id,
        band: state.selectedBand,
      });
      if (predError) console.error("[Battle] prediction insert error:", predError);
      else await loadHistoryPredictions();
    } catch (e) {
      console.error("[Battle] submit error:", e);
    }
  }


  if (loading) {
    return (
      <div className="relative min-h-screen bg-background">
        <div className="fixed top-0 left-0 right-0 z-50 bg-card">
          <V3Header rightSlot={
            <div className="flex items-center gap-1">
              <Ticket className="text-primary/40 h-[16px] w-[18px]" />
              <Skeleton className="h-4 w-4" />
            </div>
          } />
        </div>

        <div className="relative z-10 pt-16 pb-48 space-y-5 max-w-2xl mx-auto w-full">
          <div className="text-center space-y-4 pt-6 pb-4 max-w-lg sm:max-w-4xl mx-auto px-4">
            <Skeleton className="h-7 w-40 mx-auto" />
            <Skeleton className="h-12 w-48 mx-auto" />
            <div className="flex items-center justify-center gap-1.5 mt-6 mb-4">
              <Skeleton className="h-7 w-14" />
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-7 w-16" />
            </div>
          </div>

          {[0, 1].map(i => (
            <div key={i} className="max-w-sm sm:max-w-[80%] mx-auto px-2 sm:px-0">
              <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                <Skeleton className="h-5 w-3/5" />
                <Skeleton className="h-3 w-4/5" />
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Skeleton className="aspect-[4/5] w-full rounded-xl" />
                  <Skeleton className="aspect-[4/5] w-full rounded-xl" />
                </div>
                <div className="flex gap-2 justify-center pt-2">
                  <Skeleton className="h-8 w-20 rounded-full" />
                  <Skeleton className="h-8 w-20 rounded-full" />
                  <Skeleton className="h-8 w-20 rounded-full" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }


  return (
    <div className="relative min-h-screen bg-background">
      <SEO
        title="KTrenZ – K-Pop Content Battle"
        titleKo="KTrenZ – K-Pop 콘텐츠 배틀"
        description="Pick the winning K-Pop content. Vote and earn K-Cash."
        descriptionKo="이길 K-Pop 콘텐츠를 골라 투표하고 K-Cash를 모으세요."
        path="/battle"
      />
      <div className="fixed top-0 left-0 right-0 z-50 bg-card">
        <V3Header rightSlot={
          <button onClick={() => setShowTicketInfo(true)} className="flex items-center gap-1 active:opacity-60 transition-opacity">
            <Ticket className="text-primary h-[16px] w-[18px]" />
            <span className="font-bold text-primary text-sm">{remainingTickets}</span>
          </button>
        } />
      </div>
      <TicketInfoPopup open={showTicketInfo} onClose={() => setShowTicketInfo(false)} remaining={remainingTickets} total={totalTickets} totalPoints={profile?.total_points ?? 0} />

      <div className="relative z-10 pt-16 pb-48 space-y-5">
        {/* Title + Flip Timer */}
        <div className="text-center sm:text-left space-y-4 pt-6 pb-4 max-w-lg sm:max-w-4xl mx-auto px-4">
          <h2 className="text-xl text-foreground tracking-tight font-sans font-bold sm:text-3xl text-center">
            {t("pickWinner")}
          </h2>
          <FlipTimer />

          {/* Filter Tabs */}
          <div className="flex items-center justify-center gap-1.5 mt-6 mb-4">
            {([
              { key: "live" as const, label: language === "ko" ? "라이브" : language === "ja" ? "ライブ" : language === "zh" ? "进行中" : "Live" },
              { key: "settled" as const, label: language === "ko" ? "정산완료" : language === "ja" ? "精算済" : language === "zh" ? "已结算" : "Settled" },
              { key: "myBets" as const, label: language === "ko" ? "내 참여" : language === "ja" ? "参加済" : language === "zh" ? "我的参与" : "My Bets" },
            ]).map(tab => {
              const count = battlePairs.filter((_, idx) => {
                const state = getPairState(idx);
                if (tab.key === "live") return !state.submitted || predictions.find(p => p.pickedRunId === state.pickedRunId)?.status === "pending";
                if (tab.key === "settled") return state.submitted && predictions.find(p => p.pickedRunId === state.pickedRunId)?.status !== "pending";
                return state.submitted;
              }).length;
              const displayCount = tab.key === "live"
                ? count
                : tab.key === "settled"
                ? settledBattleResults.length
                : myBetPredictions.length;
              return (
                <button
                  key={tab.key}
                  onClick={() => setBattleFilter(tab.key)}
                  className={cn(
                    "px-3.5 py-2 text-xs font-semibold transition-all border-b-2",
                    battleFilter === tab.key
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab.label} {displayCount > 0 && <span className="ml-0.5 opacity-70">{displayCount}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* My Bets tab */}
        {battleFilter === "myBets" && myBetPredictions.length > 0 && (
          <div className="max-w-lg sm:max-w-4xl mx-auto px-4 space-y-2 mb-4">
            <div className="flex items-center gap-2 pb-1">
              <Trophy className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">
                {t("historyTab")} ({myBetPredictions.length})
              </span>
            </div>
            {myBetPredictions.map((pred, i) => (
              <div key={pred.id || `${pred.pickedRunId}-${pred.opponentRunId}-${pred.band}-${pred.created_at || i}`} className="rounded-xl bg-card shadow-sm p-3 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {pred.pickedStarName} <span className="text-muted-foreground font-normal">vs</span> {pred.opponentStarName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {pred.battle_date && <span className="mr-1.5 opacity-60">{pred.battle_date}</span>}
                    {t(pred.band === "steady" ? "bandSteady" : pred.band === "rising" ? "bandRising" : "bandSurge")} · {BANDS.find((b) => b.key === pred.band)?.range}
                    {pred.reward_amount != null && pred.status === "won" && <span className="ml-1 text-primary font-bold">+{pred.reward_amount}💎</span>}
                  </p>
                </div>
                <Badge variant="outline" className="ml-2 shrink-0">
                  {t(pred.status === "pending" ? "pending" : pred.status === "won" ? "won" : "lost")}
                </Badge>
              </div>
            ))}
          </div>
        )}

        {/* Settled tab: all battle pair results */}
        {battleFilter === "settled" && settledBattleResults.length > 0 && (
          <div className="max-w-lg sm:max-w-4xl mx-auto px-4 space-y-3 mb-4">
            {(() => {
              const grouped = new Map<string, typeof settledBattleResults>();
              settledBattleResults.forEach(r => {
                const arr = grouped.get(r.battleDate) || [];
                arr.push(r);
                grouped.set(r.battleDate, arr);
              });
              return Array.from(grouped.entries()).map(([date, pairs]) => (
                <div key={date} className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{date}</p>
                  {pairs.map((pair, i) => {
                    const aWins = pair.growthA > pair.growthB;
                    const bWins = pair.growthB > pair.growthA;
                    const draw = pair.growthA === pair.growthB;
                    return (
                      <div key={i} className="rounded-2xl bg-card shadow-sm overflow-hidden">
                        <div className="grid grid-cols-[1fr_auto_1fr] items-center">
                          {/* Star A */}
                          <div className={cn("px-3 py-2.5 text-center", aWins && "bg-primary/[0.05]")}>
                            <p className={cn("text-sm font-bold truncate", aWins ? "text-foreground" : "text-muted-foreground")}>{pair.starA}</p>
                            <p className={cn("text-lg font-black mt-0.5", aWins ? "text-foreground" : "text-muted-foreground")}>
                              {pair.growthA > 0 ? "+" : ""}{pair.growthA}%
                            </p>
                            {aWins && <span className="text-[10px] font-bold text-primary">▲ {t("winner")}</span>}
                          </div>
                          {/* VS */}
                          <div className="px-2 text-center">
                            <span className="text-[10px] font-bold text-muted-foreground/40">VS</span>
                          </div>
                          {/* Star B */}
                          <div className={cn("px-3 py-2.5 text-center", bWins && "bg-primary/[0.05]")}>
                            <p className={cn("text-sm font-bold truncate", bWins ? "text-foreground" : "text-muted-foreground")}>{pair.starB}</p>
                            <p className={cn("text-lg font-black mt-0.5", bWins ? "text-foreground" : "text-muted-foreground")}>
                              {pair.growthB > 0 ? "+" : ""}{pair.growthB}%
                            </p>
                            {bWins && <span className="text-[10px] font-bold text-primary">▲ {t("winner")}</span>}
                          </div>
                        </div>
                        {draw && <p className="text-center text-[10px] text-muted-foreground pb-2">{t("draw")}</p>}
                      </div>
                    );
                  })}
                </div>
              ));
            })()}
          </div>
        )}

        {/* Filtered battle pairs */}
        {battlePairs.map((pair, pairIdx) => {
          // Filter logic
          const state = getPairState(pairIdx);
          const pred = predictions.find(p => p.pickedRunId === state.pickedRunId);
          if (battleFilter === "myBets" || battleFilter === "settled") return null;
          if (battleFilter === "live" && state.submitted && pred?.status !== "pending") return null;

          const pairState = getPairState(pairIdx);
          const pairRuns = pair.runs;
          const pairItems = pair.items;
          const pickedRun = pairRuns.find((r) => r.id === pairState.pickedRunId);

          return (
            <div
              key={pairIdx}
              ref={(el) => { pairRefs.current[pairIdx] = el; }}
              data-pair-idx={pairIdx}
              className="space-y-5 relative"
            >
              {/* Question-style battle header */}
              <div className={cn("max-w-sm sm:max-w-[80%] mx-auto px-2 sm:px-0", pairIdx > 0 ? "my-6" : "mb-1")}>
                <div
                  className={cn(
                    "rounded-2xl p-4 space-y-2 transition-all shadow-sm",
                    pairState.submitted ? "bg-primary/5" : "bg-card",
                  )}
                  onClick={() => {
                    if (battleFilter === "live" && pairState.submitted) {
                      setCollapsedPairs(prev => {
                        const next = new Set(prev);
                        if (next.has(pairIdx)) next.delete(pairIdx);
                        else next.add(pairIdx);
                        return next;
                      });
                    }
                  }}
                >
                  {/* Battle number badge */}
                  <div className="flex items-center justify-between">
                    <span className={cn("text-[10px] font-bold uppercase tracking-widest rounded-full px-3 py-1",
                      pairState.submitted
                        ? "bg-primary/15 text-primary"
                        : "bg-primary text-primary-foreground"
                    )}>
                      Battle {pairIdx + 1}{pairState.submitted ? ` ✓` : ""}
                    </span>
                    {battleFilter === "live" && pairState.submitted && (
                      <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", collapsedPairs.has(pairIdx) && "rotate-180")} />
                    )}
                  </div>

                  {/* Question text */}
                  <p className="text-sm sm:text-base font-bold text-foreground leading-snug">
                    {(() => {
                      const starA = pairRuns[0]?.star?.display_name || "A";
                      const starB = pairRuns[1]?.star?.display_name || "B";
                      return t("questionFormat").replace("{a}", starA).replace("{b}", starB);
                    })()}
                  </p>

                  {/* Tap to analyze hint */}
                  {!pairState.submitted && (
                    <p className="text-[11px] text-muted-foreground">{t("tapToAnalyze")}</p>
                  )}
                </div>
              </div>


              {/* Collapsible content for submitted pairs in live tab */}
              {battleFilter === "live" && pairState.submitted && collapsedPairs.has(pairIdx) ? null : (
              <>

              {/* Card carousels — full width */}
              <div className="w-full px-2 sm:px-4">
                {pairRuns.map((run, idx) => (
                  <div key={run.id}>
                    {idx > 0 && (
                      <div className="my-6 flex items-center gap-3 px-4">
                        <div className="flex-1 h-px bg-border/60" />
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">vs</span>
                        <div className="flex-1 h-px bg-border/60" />
                      </div>
                    )}
                    <div className="space-y-2">
                      <ArtistSection
                        runItems={pairItems[run.id] || []}
                        runId={run.id}
                        starId={run.star_id}
                        starName={run.star?.display_name || "Unknown"}
                        starImage={run.star?.image_url || null}
                        contentScore={parseFloat((run.content_score + getHotBonus(pairIdx, run.id)).toFixed(1))}
                        scoreLabel={t("contentScore")}
                        isPicked={pairState.pickedRunId === run.id}
                        isSubmitted={pairState.submitted}
                        onPick={() => handlePick(pairIdx, run.id)}
                        onCardTap={(item) => { setDrawerItem(item); setDrawerPairIndex(pairIdx); }}
                        onInsightOpen={() => openInsightDrawer(run.id, run.star_id, run.star?.display_name || "Unknown")}
                        disabled={pairState.submitted}
                        index={idx}
                      />
                    </div>
                  </div>
                ))}
              </div>

              </>
              )}
            </div>
          );
        })}

        {/* Today's Battle Summary — only in live tab when there are submissions */}
        {battleFilter === "live" && predictions.filter(p => p.status === "pending").length > 0 && (
          <div className="max-w-lg sm:max-w-4xl mx-auto px-4 mt-6 mb-2">
            <div className="rounded-2xl bg-card shadow-sm p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-primary" />
                <span className="text-sm font-bold text-foreground">
                  {language === "ko" ? "오늘의 배틀 요약" : language === "ja" ? "今日のバトルまとめ" : language === "zh" ? "今日战斗摘要" : "Today's Battle Summary"}
                </span>
              </div>
              <div className="space-y-2">
                {predictions.filter(p => p.status === "pending").map((pred, i) => {
                  const bandInfo = BANDS.find(b => b.key === pred.band);
                  const BandIcon = bandInfo?.icon || Sprout;
                  const bandLabel = pred.band === "steady" ? (language === "ko" ? "안정" : "Steady")
                    : pred.band === "rising" ? (language === "ko" ? "상승" : "Rising")
                    : (language === "ko" ? "급등" : "Surge");
                  return (
                    <div key={i} className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-bold text-primary truncate">{pred.pickedStarName}</span>
                        <span className="text-[10px] text-muted-foreground">vs</span>
                        <span className="text-xs text-muted-foreground truncate">{pred.opponentStarName}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <BandIcon className={cn("w-3.5 h-3.5", bandInfo?.iconColor)} />
                        <span className="text-[11px] font-semibold text-foreground">{bandLabel}</span>
                        <span className="text-[10px] text-muted-foreground">+{bandInfo?.reward}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-border/50">
                <div className="flex items-center gap-1.5">
                  <Ticket className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[11px] text-muted-foreground">
                    {language === "ko" ? "사용한 티켓" : "Tickets used"}
                  </span>
                  <span className="text-xs font-bold text-foreground">
                    {predictions.filter(p => p.status === "pending").length}/{totalTickets}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-[11px] text-muted-foreground">
                    {language === "ko" ? "매일 결과 발표" : "Daily results"}
                  </span>
                  <span className="text-xs font-bold text-foreground">15:00 GMT</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Empty states */}
        {battleFilter === "myBets" && myBetPredictions.length === 0 && (
          <div className="flex items-center justify-center min-h-[40vh] text-muted-foreground text-sm">
            {t("noBattlesYet")}
          </div>
        )}
        {battleFilter === "settled" && settledBattleResults.length === 0 && (
          <div className="flex items-center justify-center min-h-[40vh] text-muted-foreground text-sm">
            {t("noSettled")}
          </div>
        )}
        {battleFilter === "live" && battlePairs.every((_, idx) => {
          const s = getPairState(idx);
          const p = predictions.find(pr => pr.pickedRunId === s.pickedRunId);
          return s.submitted && p?.status !== "pending";
        }) && (
          <div className="flex items-center justify-center min-h-[40vh] text-muted-foreground text-sm">
            {t("allDone")}
          </div>
        )}

      </div>

      {/* Detail Drawer */}
      <Sheet open={!!drawerItem} onOpenChange={(open) => !open && setDrawerItem(null)}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[90vh] overflow-y-auto sm:max-w-lg sm:mx-auto focus:outline-none focus-visible:outline-none focus-visible:ring-0" hideClose>
          {drawerItem && (() => {
            const drawerPair = battlePairs[drawerPairIndex];
            const drawerRuns = drawerPair?.runs || [];
            const starRun = drawerRuns.find((r) => r.star_id === drawerItem.star_id);
            const meta = drawerItem.metadata || {};
            return (
              <>
                {/* Drag handle */}
                <div className="flex justify-center pt-2 pb-4">
                  <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
                </div>

                {/* Artist · Date */}
                <p className="text-[11px] text-muted-foreground mb-2">
                  <span className="font-semibold text-foreground">{starRun?.star?.display_name || ""}</span>
                  {drawerItem.published_at && (
                    <span> · {(() => {
                      const d = new Date(drawerItem.published_at);
                      return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
                    })()}</span>
                  )}
                </p>

                {/* Media embed or thumbnail */}
                <div className="rounded-2xl overflow-hidden bg-muted mb-4">
                  {(() => {
                    const source = drawerItem.source;
                    const url = drawerItem.url || meta.url || "";

                    // YouTube embed
                    const ytMatch = url.match(/(?:v=|\/embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
                    const ytId = ytMatch?.[1] || meta.videoId;
                    if ((source === "youtube" || ytId) && ytId) {
                      return (
                        <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
                          <iframe
                            src={`https://www.youtube.com/embed/${ytId}?rel=0&autoplay=1&mute=1`}
                            className="absolute inset-0 w-full h-full border-0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        </div>
                      );
                    }

                    // TikTok embed
                    if (source === "tiktok" && url) {
                      const tiktokIdMatch = url.match(/\/video\/(\d+)/);
                      const tiktokId = tiktokIdMatch?.[1] || meta.embed_video_id;
                      if (tiktokId) {
                        return (
                          <iframe
                            src={`https://www.tiktok.com/embed/v2/${tiktokId}?autoplay=1`}
                            className="w-full border-0"
                            style={{ height: "580px" }}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                        );
                      }
                    }

                    // Instagram: resolve media via edge function, play in-drawer
                    if (source === "instagram" && url) {
                      return (
                        <InstagramEmbed
                          key={drawerItem.id}
                          item={drawerItem}
                          starId={drawerItem.star_id}
                        />
                      );
                    }

                    // Fallback: thumbnail image
                    return drawerItem.thumbnail ? (
                      <SmartImage src={drawerItem.thumbnail} alt={drawerItem.title} className="w-full h-auto" />
                    ) : (
                      <div className="w-full aspect-video bg-muted" />
                    );
                  })()}
                </div>

                {/* Title */}
                <h3 className="text-base font-semibold text-foreground leading-snug mb-2">{decodeHtml(getLocalizedTitle(drawerItem, language))}</h3>

                {/* Description */}
                {(() => {
                  let desc = drawerItem.description;
                  if (!desc) return null;
                  // Filter CSS code, template vars, or heavily garbled text
                  if (/^\.[\w_]+\s*\{/.test(desc.trim())) return null;
                  if (/\{\{[\w#\/]/.test(desc)) return null;
                  // Strip inline CSS blocks that sneak into scraped descriptions
                  if (/[\w.#-]+\s*\{[^}]*\}/.test(desc)) return null;
                  // Check for garbled encoding: high ratio of replacement/control chars
                  const garbledCount = (desc.match(/[\x00-\x08\uFFFD]/g) || []).length;
                  if (garbledCount > 5) return null;
                  // Strip news bylines: [서울=뉴시스]기자명 기자 = , (서울=연합뉴스) etc.
                  desc = desc.replace(/[\[(\[]\s*\S+=\S+[\])\]]\s*\S+\s*기자\s*=\s*/g, "").trim();
                  desc = desc.replace(/^\s*\S+\s+기자\s*=\s*/, "").trim();
                  // Strip email addresses and DB prohibition notices
                  desc = desc.replace(/\S+@\S+\.\S+/g, "").replace(/\*재판매\s*및\s*DB\s*금지/g, "").trim();
                  // Strip photo credit lines: (사진 = xxx 제공) or (사진=xxx)
                  desc = desc.replace(/\(사진\s*=?\s*[^)]*제공\)\s*\d{4}\.\d{2}\.\d{2}\.?/g, "").trim();
                  if (!desc) return null;
                  const displayDesc = desc.length > 300 ? desc.slice(0, 300) + "…" : desc;
                  return (
                    <p className="text-sm text-muted-foreground leading-relaxed mb-2">
                      {decodeHtml(displayDesc)}
                    </p>
                  );
                })()}

                {/* External link */}
                {(drawerItem.url || meta.url || meta.videoId) && (
                  <div className="flex justify-end gap-1 mb-4">
                    <a
                      href={drawerItem.url || meta.url || (meta.videoId ? `https://www.youtube.com/watch?v=${meta.videoId}` : "#")}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-muted/50 transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button
                      onClick={() => {
                        const shareUrl = drawerItem.url || meta.url || (meta.videoId ? `https://www.youtube.com/watch?v=${meta.videoId}` : "");
                        if (navigator.share) {
                          navigator.share({ title: drawerItem.title, url: shareUrl }).catch(() => {});
                        } else {
                          navigator.clipboard.writeText(shareUrl);
                        }
                      }}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-muted/50 transition-colors"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {meta.likes != null && (
                    <div className="rounded-xl bg-muted/50 p-3">
                      <p className="text-[10px] text-muted-foreground mb-0.5">Likes</p>
                      <p className="text-sm font-medium text-foreground">{Number(meta.likes).toLocaleString()}</p>
                    </div>
                  )}
                  {meta.plays != null && (
                    <div className="rounded-xl bg-muted/50 p-3">
                      <p className="text-[10px] text-muted-foreground mb-0.5">Views</p>
                      <p className="text-sm font-medium text-foreground">{Number(meta.plays).toLocaleString()}</p>
                    </div>
                  )}
                  {meta.comments != null && (
                    <div className="rounded-xl bg-muted/50 p-3">
                      <p className="text-[10px] text-muted-foreground mb-0.5">Comments</p>
                      <p className="text-sm font-medium text-foreground">{Number(meta.comments).toLocaleString()}</p>
                    </div>
                  )}
                  {meta.channelTitle && (
                    <div className="rounded-xl bg-muted/50 p-3">
                      <p className="text-[10px] text-muted-foreground mb-0.5">Channel</p>
                      <p className="text-sm font-medium text-foreground truncate">{meta.channelTitle}</p>
                    </div>
                  )}
                  {meta.author && (
                    <div className="rounded-xl bg-muted/50 p-3">
                      <p className="text-[10px] text-muted-foreground mb-0.5">Author</p>
                      <p className="text-sm font-medium text-foreground truncate">{meta.author}</p>
                    </div>
                  )}
                  {meta.subreddit && (
                    <div className="rounded-xl bg-muted/50 p-3">
                      <p className="text-[10px] text-muted-foreground mb-0.5">Subreddit</p>
                      <p className="text-sm font-medium text-foreground">r/{meta.subreddit}</p>
                    </div>
                  )}
                </div>

                {/* Hot button */}
                <button
                  onClick={() => toggleHot(drawerPairIndex, drawerItem.id)}
                  className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 transition-all text-sm font-semibold focus:outline-none focus-visible:outline-none focus-visible:ring-0 ${
                    getPairState(drawerPairIndex).hotVotes.has(drawerItem.id)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-primary"
                  }`}
                >
                  <Flame className={`w-4 h-4 ${getPairState(drawerPairIndex).hotVotes.has(drawerItem.id) ? "fill-current" : ""}`} />
                  {getPairState(drawerPairIndex).hotVotes.has(drawerItem.id) ? "Hot!" : t("markHot")}
                </button>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* Insight Report Drawer */}
      <Sheet open={!!insightDrawer?.open} onOpenChange={(open) => { if (!open) setInsightDrawer(null); }}>
        <SheetContent side="bottom" className="rounded-t-2xl h-[85vh] overflow-y-auto sm:max-w-lg sm:mx-auto" onOpenAutoFocus={(e) => e.preventDefault()}>
          <SheetHeader>
            <SheetTitle className="text-base font-bold flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              {insightDrawer?.starName} Trend Report
            </SheetTitle>
          </SheetHeader>
          <div className="py-4 space-y-4">
            {insightLoading && !insightData[`${insightDrawer?.runId}-${insightDrawer?.starId}-${language}`] ? (
              <div className="flex flex-col items-center justify-center gap-3 min-h-[240px]">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                <InsightLoadingText starName={insightDrawer?.starName ?? ""} t={globalT} />
              </div>
            ) : (() => {
              const key = `${insightDrawer?.runId}-${insightDrawer?.starId}-${language}`;
              const data = insightData[key];
              if (!data) return <p className="text-sm text-muted-foreground text-center py-8">No data available</p>;
              return (
                <div className="space-y-5">
                  {data.headline && (
                    <div className="rounded-xl bg-muted border border-border p-4">
                      <p className="text-lg font-bold text-foreground">{data.headline}</p>
                    </div>
                  )}
                  {data.bullets && data.bullets.length > 0 && (
                    <div className="space-y-3">
                      {data.bullets.map((bullet, i) => (
                        <div key={i} className="flex gap-3 items-start">
                          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-xs font-bold text-muted-foreground">{i + 1}</span>
                          </div>
                          <p className="text-sm text-foreground leading-relaxed">{bullet}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Lifestyle Trends */}
                  {data.lifestyle && data.lifestyle.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Lifestyle Trends</p>
                      <div className="grid gap-2">
                        {data.lifestyle.map((item, i) => {
                          const icon = item.category === "fashion" ? "👗" : item.category === "food" ? "🍽️" : item.category === "place" ? "📍" : "🎬";
                          const catLabel = item.category === "fashion" ? (language === "ko" ? "패션" : language === "ja" ? "ファッション" : language === "zh" ? "时尚" : "Fashion")
                            : item.category === "food" ? (language === "ko" ? "음식" : language === "ja" ? "グルメ" : language === "zh" ? "美食" : "Food")
                            : item.category === "place" ? (language === "ko" ? "장소" : language === "ja" ? "スポット" : language === "zh" ? "地点" : "Place")
                            : (language === "ko" ? "활동" : language === "ja" ? "アクティビティ" : language === "zh" ? "活动" : "Activity");
                          return (
                            <div key={i} className="rounded-lg bg-muted p-3 space-y-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-base">{icon}</span>
                                <span className="text-[10px] font-semibold text-muted-foreground uppercase">{catLabel}</span>
                              </div>
                              <p className="text-sm text-foreground leading-snug">{item.text}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {data.vibe && (
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-xs text-muted-foreground">Trend Vibe:</span>
                      <Badge variant="secondary" className={cn(
                        "text-xs",
                        data.vibe === "hot" && "bg-primary/10 text-primary",
                        data.vibe === "rising" && "bg-primary/10 text-primary",
                        data.vibe === "steady" && "bg-muted text-muted-foreground",
                      )}>
                        {data.vibe === "hot" ? "Hot" : data.vibe === "rising" ? "Rising" : "Steady"}
                      </Badge>
                    </div>
                  )}

                  {/* Trend Bet Box — full betting with 3 bands */}
                  {(() => {
                    const pairIdx = battlePairs.findIndex(p => p.runs.some(r => r.id === insightDrawer?.runId));
                    const pair = battlePairs[pairIdx];
                    const pairState = pairIdx >= 0 ? getPairState(pairIdx) : null;
                    const currentRun = pair?.runs.find(r => r.id === insightDrawer?.runId);
                    if (!pair || !currentRun) return null;
                    const isAlreadySubmitted = pairState?.submitted;
                    const isPicked = pairState?.pickedRunId === currentRun.id;
                    const isPickedInDrawer = pairState?.pickedRunId === currentRun.id;

                    const betTitle = language === "ko" ? `${insightDrawer?.starName}의 트렌드가 내일 더 유행할까?`
                      : language === "ja" ? `${insightDrawer?.starName}のトレンドは明日上がる？`
                      : language === "zh" ? `${insightDrawer?.starName}的趋势明天会上涨吗？`
                      : `Will ${insightDrawer?.starName}'s trend rise tomorrow?`;

                    const pickLabel = t("predictGrowth");
                    const submittedLabel = language === "ko" ? "예측 완료!" : language === "ja" ? "予測完了！" : language === "zh" ? "预测完成！" : "Prediction submitted!";
                    const alreadyLabel = language === "ko" ? "이미 예측함" : language === "ja" ? "予測済み" : language === "zh" ? "已预测" : "Already predicted";

                    return (
                      <div className="rounded-xl border border-border bg-background p-4 space-y-3">
                        <p className="text-sm font-bold text-foreground text-center">{betTitle}</p>

                        {isAlreadySubmitted ? (
                          <div className="flex items-center gap-2 py-1">
                            <Badge variant="secondary" className="text-xs">
                              {isPicked ? `✅ ${submittedLabel}` : alreadyLabel}
                            </Badge>
                            {isPicked && pairState?.selectedBand && (
                              <Badge variant="outline" className="text-xs">
                                {t(pairState.selectedBand === "steady" ? "bandSteady" : pairState.selectedBand === "rising" ? "bandRising" : "bandSurge")} {BANDS.find(b => b.key === pairState.selectedBand)?.range}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {/* Band selection */}
                            <div className="grid grid-cols-3 gap-2">
                              {BANDS.map((band) => {
                                const drawerBand = isPickedInDrawer ? pairState?.selectedBand : null;
                                const isSelected = drawerBand === band.key;
                                const BandIcon = band.icon;
                                const bandLabel = t(band.key === "steady" ? "bandSteady" : band.key === "rising" ? "bandRising" : "bandSurge");
                                return (
                                  <button
                                    key={band.key}
                                    onClick={() => {
                                      if (!user) { toast({ title: "Please log in", variant: "destructive" }); navigate("/login"); return; }
                                      // Set pick + band in a single state update to avoid stale state
                                      const currentBand = pairState?.pickedRunId === currentRun.id ? pairState?.selectedBand : null;
                                      updatePairState(pairIdx, {
                                        pickedRunId: currentRun.id,
                                        selectedBand: currentBand === band.key ? null : band.key,
                                      });
                                    }}
                                    className={cn(
                                      "flex flex-col items-center py-2.5 px-1 rounded-xl border transition-all",
                                      isSelected ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-background hover:border-primary/40"
                                    )}
                                  >
                                    <span className="text-base">{band.key === "steady" ? "🌱" : band.key === "rising" ? "🔥" : "🚀"}</span>
                                    <span className="text-[10px] font-medium">{bandLabel}</span>
                                    <span className="text-sm font-extrabold mt-0.5">{band.range}</span>
                                    <span className="text-[10px] font-bold text-muted-foreground">+{band.reward.toLocaleString()} 💎</span>
                                  </button>
                                );
                              })}
                            </div>

                            {/* Submit */}
                            <Button
                              size="sm"
                              className="w-full"
                              disabled={!isPickedInDrawer || !pairState?.selectedBand}
                              onClick={() => {
                                handleSubmit(pairIdx);
                                setInsightDrawer(null);
                              }}
                            >
                              {pickLabel}
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })()}
          </div>
        </SheetContent>
      </Sheet>

      <AllTicketsUsedModal
        open={showAllUsedModal}
        onClose={() => setShowAllUsedModal(false)}
        language={language}
        userLevel={userLevel}
        kPoints={kPoints}
        totalTickets={totalTickets}
      />
      {confirmModal && (
        <PredictionConfirmModal
          open={!!confirmModal}
          onClose={() => setConfirmModal(null)}
          language={language}
          starName={confirmModal.starName}
          band={confirmModal.band}
          reward={confirmModal.reward}
          kPoints={kPoints}
        />
      )}
      <SettlementResultsModal
        open={showSettlementModal}
        onClose={() => {
          setShowSettlementModal(false);
          // Mark as seen via RPC when user confirms
          const ids = settlementResults.map(r => r.id);
          if (ids.length > 0) {
            supabase.rpc("mark_b2_predictions_seen", { _prediction_ids: ids } as any).then(() => {});
          }
        }}
        results={settlementResults}
        language={language}
      />
      {/* First Analyzer Bonus Modal */}
      <Dialog open={showFirstAnalyzerModal} onOpenChange={setShowFirstAnalyzerModal}>
        <DialogContent className="max-w-sm rounded-2xl text-center mx-auto">
          <DialogTitle className="sr-only">First Analyzer Bonus</DialogTitle>
          <DialogDescription className="sr-only">You earned a bonus for being the first to analyze this trend</DialogDescription>
          <div className="flex flex-col items-center pt-2">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <h3 className="mb-2 text-lg font-bold text-foreground">
              {globalT("battle.firstAnalyzerTitle")}
            </h3>
            <p className="mb-5 text-sm text-muted-foreground">
              {globalT("battle.firstAnalyzerDesc")}
            </p>
            <div className="mb-5 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-4 py-2 text-lg font-bold text-primary">
              <Gift className="h-5 w-5" />
              +30 K-Cashes
            </div>
            <Button className="w-full" onClick={() => setShowFirstAnalyzerModal(false)}>
              OK
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bottom sticky CommitBar for currently-active pair */}
      {battleFilter === "live" && activePairIdx !== null && (() => {
        const activePair = battlePairs[activePairIdx];
        if (!activePair) return null;
        const state = getPairState(activePairIdx);
        if (state.submitted) return null;
        const [runA, runB] = activePair.runs;
        if (!runA || !runB) return null;
        const pickedRun = activePair.runs.find(r => r.id === state.pickedRunId);
        const pickedStar = pickedRun?.star?.display_name || "";

        return (
          <div
            className="fixed bottom-0 left-0 right-0 z-40 bg-card/80 backdrop-blur-xl shadow-[0_-8px_28px_-8px_rgba(0,0,0,0.08)]"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="max-w-md mx-auto px-4 py-3 space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-muted-foreground">
                  Battle {activePairIdx + 1}
                </span>
                {state.pickedRunId && (
                  <button
                    onClick={() => updatePairState(activePairIdx, { pickedRunId: null, selectedBand: null })}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {globalT("common.change")}
                  </button>
                )}
              </div>

              {!state.pickedRunId ? (
                <div className="grid grid-cols-2 gap-2">
                  {[runA, runB].map((run, idx) => (
                    <button
                      key={run.id}
                      onClick={() => handlePick(activePairIdx, run.id)}
                      className="flex flex-col items-center justify-center py-2.5 px-2 rounded-xl bg-card hover:bg-muted/50 active:scale-[0.98] transition-all shadow-sm"
                    >
                      <span className="text-[10px] font-extrabold text-muted-foreground">
                        {idx === 0 ? "A" : "B"}
                      </span>
                      <span className="text-sm font-bold text-foreground truncate max-w-full">
                        {run.star?.display_name || "—"}
                      </span>
                      <span className="text-[9px] text-muted-foreground">
                        {t("labelTrendBy")}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-1.5 text-xs">
                    <Trophy className="w-3 h-3 text-primary" />
                    <span className="font-bold text-primary truncate max-w-[50%]">{pickedStar}</span>
                    <span className="text-muted-foreground">· {t("predictGrowth")}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {BANDS.map((band) => {
                      const isSelected = state.selectedBand === band.key;
                      const bandLabel = t(band.key === "steady" ? "bandSteady" : band.key === "rising" ? "bandRising" : "bandSurge");
                      return (
                        <button
                          key={band.key}
                          onClick={() =>
                            updatePairState(activePairIdx, {
                              selectedBand: state.selectedBand === band.key ? null : band.key,
                            })
                          }
                          className={cn(
                            "flex flex-col items-center py-1.5 px-1 rounded-lg transition-all shadow-sm",
                            isSelected
                              ? "bg-primary/10 ring-1 ring-primary"
                              : "bg-card hover:bg-muted/50",
                          )}
                        >
                          <span className="text-sm leading-none">
                            {band.key === "steady" ? "🌱" : band.key === "rising" ? "🔥" : "🚀"}
                          </span>
                          <span className="text-[10px] font-medium mt-0.5">{bandLabel}</span>
                          <span className="text-[9px] font-bold text-muted-foreground">+{band.reward.toLocaleString()}💎</span>
                        </button>
                      );
                    })}
                  </div>
                  <Button
                    size="sm"
                    className="w-full h-9"
                    disabled={!state.selectedBand}
                    onClick={() => handleSubmit(activePairIdx)}
                  >
                    {t("submitPrediction")}
                  </Button>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
