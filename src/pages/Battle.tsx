import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";
import SEO from "@/components/SEO";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Zap, Trophy, TrendingUp, Clock, ChevronLeft, ChevronRight, ExternalLink, Flame, Share2, Play, Music, Camera, Newspaper, MessageCircle, FileText, Sprout, Rocket, ChevronDown, Ticket, Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import V3Header from "@/components/v3/V3Header";
import V3TabBar from "@/components/v3/V3TabBar";
import { useLanguage } from "@/contexts/LanguageContext";
import { useFieldTranslation } from "@/hooks/useFieldTranslation";
import SmartImage from "@/components/SmartImage";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/* ── Ticket Info Popup ── */
const TIER_TICKETS = [
  { tier: { en: "Beginner", ko: "초보", ja: "初心者", zh: "新手" }, level: "Lv.1–5", tickets: 3 },
  { tier: { en: "Explorer", ko: "탐색가", ja: "探索者", zh: "探索者" }, level: "Lv.6–15", tickets: 5 },
  { tier: { en: "Analyst", ko: "분석가", ja: "分析家", zh: "分析师" }, level: "Lv.16–30", tickets: 7 },
  { tier: { en: "Expert", ko: "전문가", ja: "専門家", zh: "专家" }, level: "Lv.31+", tickets: 10 },
];

const TicketInfoPopup = ({ open, onClose, remaining, total }: { open: boolean; onClose: () => void; remaining: number; total: number }) => {
  const { language } = useLanguage();
  if (!open) return null;

  const lang = (language === "ko" || language === "ja" || language === "zh") ? language : "en";
  const title = lang === "ko" ? "예측 티켓" : lang === "ja" ? "予測チケット" : lang === "zh" ? "预测票" : "Prediction Tickets";
  const desc = lang === "ko"
    ? "매일 15:00(GMT)에 새로 지급되며, 미사용 티켓은 소멸됩니다."
    : lang === "ja"
    ? "毎日15:00(GMT)に新しく支給され、未使用チケットは消滅します。"
    : lang === "zh"
    ? "每天15:00(GMT)重新发放，未使用的票将失效。"
    : "Tickets reset daily at 15:00 GMT. Unused tickets do not carry over.";
  const tierLabel = lang === "ko" ? "등급" : lang === "ja" ? "ランク" : lang === "zh" ? "等级" : "Tier";
  const dailyLabel = lang === "ko" ? "일일 티켓" : lang === "ja" ? "日次チケット" : lang === "zh" ? "每日票数" : "Daily Tickets";
  const closeText = lang === "ko" ? "닫기" : lang === "ja" ? "閉じる" : lang === "zh" ? "关闭" : "Close";

  return createPortal(
    <>
      <div className="fixed inset-0 z-[100] bg-black/40" onClick={onClose} />
      <div className="fixed z-[101] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(320px,90vw)] bg-card rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Ticket className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-bold text-foreground text-sm">{title}</p>
            <p className="text-xs text-muted-foreground">{remaining} / {total}</p>
          </div>
        </div>

        {/* Tier table */}
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="grid grid-cols-3 text-[11px] font-semibold text-muted-foreground bg-muted/50 px-3 py-1.5">
            <span>{tierLabel}</span>
            <span className="text-center">Level</span>
            <span className="text-right">{dailyLabel}</span>
          </div>
          {TIER_TICKETS.map((t, i) => (
            <div key={i} className={cn(
              "grid grid-cols-3 px-3 py-2 text-xs",
              t.tickets === total ? "bg-primary/5 font-bold text-primary" : "text-foreground"
            )}>
              <span>{t.tier[lang]}</span>
              <span className="text-center text-muted-foreground">{t.level}</span>
              <span className="text-right">{t.tickets}🎫</span>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed">{desc}</p>

        <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-muted text-sm font-medium text-foreground hover:bg-muted/80 transition-colors">
          {closeText}
        </button>
      </div>
    </>,
    document.body
  );
};

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
  star?: { display_name: string; name_ko: string; image_url?: string | null };
}

type Band = "steady" | "rising" | "surge";

const BANDS: { key: Band; label: string; range: string; icon: typeof Sprout; iconColor: string; reward: number }[] = [
  { key: "steady", label: "Steady", range: "15–30%", icon: Sprout, iconColor: "text-emerald-500", reward: 100 },
  { key: "rising", label: "Rising", range: "30–80%", icon: Flame, iconColor: "text-orange-500", reward: 300 },
  { key: "surge", label: "Surge", range: "80%+", icon: Rocket, iconColor: "text-red-500", reward: 1000 },
];

function decodeHtml(str: string) {
  const basic = str.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&middot;/g, '·').replace(/&hellip;/g, '…').replace(/&ndash;/g, '–').replace(/&mdash;/g, '—').replace(/&lsquo;/g, '\u2018').replace(/&rsquo;/g, '\u2019').replace(/&ldquo;/g, '\u201C').replace(/&rdquo;/g, '\u201D').replace(/&nbsp;/g, ' ');
  return basic.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function sourceIcon(source: string): ReactNode {
  const cls = "w-4 h-4 text-white drop-shadow-md";
  switch (source) {
    case "youtube": return <Play className={cls} />;
    case "tiktok": return <Music className={cls} />;
    case "instagram": return <Camera className={cls} />;
    case "naver_news": return <Newspaper className={cls} />;
    case "reddit": return <MessageCircle className={cls} />;
    default: return <FileText className={cls} />;
  }
}

/* ── Flip Timer ── */
function FlipCard({ digit }: { digit: string }) {
  const [cur, setCur] = useState(digit);
  const [prev, setPrev] = useState(digit);
  const [flipping, setFlipping] = useState(false);

  useEffect(() => {
    if (digit !== cur) {
      setPrev(cur);
      setFlipping(true);
      const t1 = setTimeout(() => {
        setCur(digit);
      }, 150);
      const t2 = setTimeout(() => {
        setFlipping(false);
      }, 400);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [digit]);

  return (
    <div className="relative w-10 h-14 sm:w-12 sm:h-16 rounded-lg overflow-hidden shadow-md" style={{ perspective: 300 }}>
      {/* Static top half — new digit */}
      <div className="absolute inset-x-0 top-0 h-1/2 bg-white flex items-end justify-center overflow-hidden">
        <span className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground translate-y-[55%]">{digit}</span>
      </div>
      {/* Static bottom half */}
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-white/90 flex items-start justify-center overflow-hidden">
        <span className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground -translate-y-[55%]">{cur}</span>
      </div>

      {/* Flipping top panel — old digit folds down */}
      {flipping && (
        <div
          className="absolute inset-x-0 top-0 h-1/2 bg-white flex items-end justify-center overflow-hidden rounded-t-lg z-20"
          style={{
            transformOrigin: "bottom center",
            animation: "flipTop 0.4s ease-in forwards",
          }}
        >
          <span className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground translate-y-[55%]">{prev}</span>
        </div>
      )}

      {/* Flipping bottom panel — new digit unfolds */}
      {flipping && (
        <div
          className="absolute inset-x-0 bottom-0 h-1/2 bg-white/90 flex items-start justify-center overflow-hidden rounded-b-lg z-20"
          style={{
            transformOrigin: "top center",
            animation: "flipBottom 0.4s 0.15s ease-out forwards",
            transform: "rotateX(90deg)",
          }}
        >
          <span className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground -translate-y-[55%]">{digit}</span>
        </div>
      )}

      {/* Center line */}
      <div className="absolute inset-x-0 top-1/2 h-px bg-border/50 z-30" />
      {/* Side notches */}
      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1.5 bg-border/30 rounded-r-full z-30" />
      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-1.5 bg-border/30 rounded-l-full z-30" />
    </div>
  );
}

function FlipGroup({ value }: { value: string }) {
  return (
    <div className="flex gap-1">
      {value.split("").map((d, i) => (
        <FlipCard key={`${value}-${i}`} digit={d} />
      ))}
    </div>
  );
}

function FlipTimer() {
  const [time, setTime] = useState({ h: 0, m: 0, s: 0 });

  useEffect(() => {
    function calc() {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      const diff = Math.max(0, Math.floor((tomorrow.getTime() - now.getTime()) / 1000));
      setTime({ h: Math.floor(diff / 3600), m: Math.floor((diff % 3600) / 60), s: diff % 60 });
    }
    calc();
    const iv = setInterval(calc, 1000);
    return () => clearInterval(iv);
  }, []);

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="flex items-center justify-center gap-2.5 sm:gap-4">
      <FlipGroup value={pad(time.h)} />
      <span className="text-2xl font-bold text-muted-foreground/60">:</span>
      <FlipGroup value={pad(time.m)} />
      <span className="text-2xl font-bold text-muted-foreground/60">:</span>
      <FlipGroup value={pad(time.s)} />
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
  onPick: () => void;
  onCardTap: (item: B2Item) => void;
  onInsightOpen: () => void;
  disabled: boolean;
  index: number;
}) {
  const { language } = useLanguage();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const itemCount = runItems.length;

  // Triple the full set so looping can preserve scroll direction without visible reversal
  const loopItems = itemCount > 1
    ? [...runItems, ...runItems, ...runItems]
    : runItems;
  const offset = itemCount > 1 ? itemCount : 0;
  const insightOffset = 1; // insight card is always the first child

  // Initialize scroll to the first real card in the middle set
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || itemCount <= 1) return;

    requestAnimationFrame(() => {
      const child = el.children[offset + insightOffset] as HTMLElement | undefined;
      if (child) {
        el.scrollLeft = child.offsetLeft;
        setActiveIndex(0);
      }
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

      const scrollLeft = el.scrollLeft;
      let closest = offset + insightOffset;
      let minDist = Infinity;

      children.forEach((child, i) => {
        if (i < insightOffset) return; // skip insight card
        const dist = Math.abs(child.offsetLeft - scrollLeft);
        if (dist < minDist) {
          minDist = dist;
          closest = i;
        }
      });

      setActiveIndex(((closest - offset - insightOffset) % itemCount + itemCount) % itemCount);
    };

    const settleLoop = () => {
      const children = Array.from(el.children) as HTMLElement[];
      const middleStart = children[offset] as HTMLElement | undefined;
      const thirdStart = children[offset + itemCount] as HTMLElement | undefined;

      if (!middleStart || !thirdStart) return;

      const setWidth = thirdStart.offsetLeft - middleStart.offsetLeft;
      if (setWidth <= 0) return;

      if (el.scrollLeft >= thirdStart.offsetLeft) {
        el.scrollLeft -= setWidth;
      } else if (el.scrollLeft < middleStart.offsetLeft) {
        el.scrollLeft += setWidth;
      }

      updateActiveIndex();
    };

    const handleScroll = () => {
      updateActiveIndex();

      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(settleLoop, 120);
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
      child.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
    }
  };

  return (
    <div className="space-y-2">
      {/* Pick bar — constrained width */}
      <div className="max-w-sm mx-auto sm:max-w-[80%] sm:mx-auto px-2 sm:px-0 mb-3">
        <button
          onClick={onPick}
          disabled={disabled}
          className={`w-full flex items-center justify-between px-4 py-4 rounded-full transition-all border shadow-sm ${
            isPicked ? "bg-white border-primary/30 shadow-primary/10" : "bg-white border-purple-300/50 hover:border-purple-400/60"
          } ${disabled ? "opacity-60" : ""}`}
        >
          <div className="flex items-center gap-1.5">
            <span className={`text-sm sm:text-base font-extrabold transition-colors ${isPicked ? "text-primary" : "text-foreground"}`}>{index === 0 ? "A" : "B"} ·</span>
             <span className="text-xs sm:text-sm text-muted-foreground">Trend by</span>
             <span className={`text-sm sm:text-base font-bold transition-colors ${isPicked ? "text-primary" : "text-foreground"}`}>{starName}</span>
          </div>
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
              isPicked ? "bg-primary" : "bg-muted"
            }`}
          >
            <svg className={`w-3.5 h-3.5 ${isPicked ? "text-primary-foreground" : "text-white"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        </button>
      </div>

      {/* Horizontal card carousel */}
      <div
        ref={scrollRef}
        className="flex gap-2.5 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-1 sm:max-w-[80%] sm:mx-auto pl-4 sm:pl-0"
      >
        {/* Insight Report Card — first position */}
        <div
          className="snap-start flex-shrink-0 w-[85%] sm:w-80 lg:w-96 cursor-pointer"
          onClick={onInsightOpen}
        >
          <div className="rounded-xl overflow-hidden bg-card border border-primary/20 h-full">
            <div className="relative aspect-video bg-gradient-to-br from-primary/10 via-primary/5 to-accent/10 flex items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <span className="text-xs font-semibold text-foreground">Trend Report</span>
                <span className="text-[10px] text-muted-foreground">Tap to view</span>
              </div>
            </div>
            <div className="p-3 min-h-[40px] flex items-center bg-primary/[0.03]">
              <p className="text-xs font-medium text-muted-foreground leading-snug line-clamp-1">
                📊 {starName}
              </p>
            </div>
          </div>
        </div>

        {loopItems.map((item, loopIdx) => (
          <div
            key={`${item.id}-loop-${loopIdx}`}
            className="snap-start flex-shrink-0 w-[85%] sm:w-80 lg:w-96 cursor-pointer"
            onClick={() => onCardTap(item)}
          >
            <div className="rounded-xl overflow-hidden bg-card border border-primary/10">
              {/* Square image */}
              <div className="relative aspect-video bg-muted">
                {item.thumbnail ? (
                  <SmartImage
                    src={item.thumbnail}
                    alt={item.title}
                    className="w-full h-full object-cover"
                    fallbackSrc={starImage}
                    fallbackClassName="w-full h-full object-contain p-4 opacity-40"
                  />
                ) : starImage ? (
                  <SmartImage src={starImage} alt="" className="w-full h-full object-contain p-4 opacity-40" />
                ) : (
                  <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground text-[10px]">No image</div>
                )}
                {/* Light purple overlay */}
                <div className="absolute inset-0 bg-primary/5 pointer-events-none" />
                {/* Bottom gradient for text readability */}
                <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-primary/15 to-transparent pointer-events-none" />
                <div className="absolute top-1.5 right-1.5">
                  {sourceIcon(item.source)}
                </div>
              </div>
              {/* Content area */}
              <div className="p-3 min-h-[40px] flex items-center bg-primary/[0.03]">
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
}

/* ── Main Battle Page ── */
export default function Battle() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { t: globalT, language } = useLanguage();
  const t = (key: string) => globalT(`battle.${key}`);
  const { translateIfNeeded } = useFieldTranslation();

  // Determine unlocked battle count based on user tier
  const userLevel = profile?.current_level ?? 1;
  const unlockedBattleCount = userLevel >= 16 ? 10 : userLevel >= 6 ? 5 : 3;
  const nextTierName = userLevel >= 16 ? "" : userLevel >= 6 ? (language === "ko" ? "분석가" : "Analyst") : (language === "ko" ? "탐색가" : "Explorer");

  const [battlePairs, setBattlePairs] = useState<BattlePair[]>([]);
  const [pairStates, setPairStates] = useState<Record<number, { pickedRunId: string | null; selectedBand: Band | null; submitted: boolean; hotVotes: Set<string> }>>({});
  const [loading, setLoading] = useState(true);
  const [drawerItem, setDrawerItem] = useState<B2Item | null>(null);
  const [drawerPairIndex, setDrawerPairIndex] = useState<number>(0);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [ticketInfo, setTicketInfo] = useState<{ remaining: number; total: number; used: number } | null>(null);
  const [showTicketInfo, setShowTicketInfo] = useState(false);
  const [battleFilter, setBattleFilter] = useState<"live" | "settled" | "myBets">("live");
  const [collapsedPairs, setCollapsedPairs] = useState<Set<number>>(new Set());
  const [insightDrawer, setInsightDrawer] = useState<{ open: boolean; runId: string; starId: string; starName: string } | null>(null);
  const [insightData, setInsightData] = useState<Record<string, { headline?: string; bullets?: string[]; vibe?: string }>>({}); // keyed by `runId-starId`
  const [insightLoading, setInsightLoading] = useState(false);

  const remainingTickets = ticketInfo?.remaining ?? 3;
  const totalTickets = ticketInfo?.total ?? 3;

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
    const key = `${runId}-${starId}`;
    setInsightDrawer({ open: true, runId, starId, starName });

    if (insightData[key]) return;

    setInsightLoading(true);
    try {
      const { data: cached } = await supabase
        .from("ktrenz_b2_insights")
        .select("insight_data")
        .eq("run_id", runId)
        .eq("star_id", starId)
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

  // Load ticket info
  const loadTickets = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.rpc("ktrenz_get_prediction_tickets" as any, { _user_id: user.id });
      const parsed = typeof data === "string" ? JSON.parse(data) : data;
      if (parsed) setTicketInfo(parsed);
    }
  }, []);

  useEffect(() => { loadBattleData(); loadTickets(); }, [loadTickets]);

  async function loadBattleData(skipTranslation = false) {
    const { data: runsData } = await (supabase
      .from("ktrenz_b2_runs") as any)
      .select("id, star_id, content_score, counts, created_at")
      .order("created_at", { ascending: false })
      .limit(20);

    if (!runsData || runsData.length < 2) {
      setLoading(false);
      return;
    }

    const allRuns = runsData as B2Run[];
    // Pick the most recent run per star (latest created_at wins)
    const starBest = new Map<string, B2Run>();
    allRuns.forEach((r) => {
      if (!starBest.has(r.star_id)) {
        starBest.set(r.star_id, r);
      }
    });

    const bestRuns = Array.from(starBest.values()).sort((a, b) => b.content_score - a.content_score);
    if (bestRuns.length < 2) { setLoading(false); return; }

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

    for (const pair of pairs) {
      for (const run of pair.runs) {
        const { data: runItems } = await supabase
          .from("ktrenz_b2_items")
          .select("id, source, title, title_en, title_ja, title_zh, title_ko, description, url, thumbnail, has_thumbnail, engagement_score, star_id, published_at, metadata")
          .eq("run_id", run.id)
          .eq("has_thumbnail", true)
          .not("source", "eq", "naver_blog")
          .order("engagement_score", { ascending: false })
          .limit(8);
        pair.items[run.id] = (runItems || []) as B2Item[];
      }
    }

    const validPairs = pairs.filter(pair => {
      const runIds = pair.runs.map(r => r.id);
      return runIds.every(id => (pair.items[id]?.length ?? 0) >= 3);
    });

    if (!skipTranslation) {
      const allItems = validPairs.flatMap(p => Object.values(p.items).flat());
      if (allItems.length > 0) {
        translateIfNeeded("ktrenz_b2_items", "title", allItems, () => {
          loadBattleData(true);
        });
      }
    }

    setBattlePairs(validPairs);

    // Restore submitted state from existing predictions in DB
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (currentUser && validPairs.length > 0) {
      const allRunIds = validPairs.flatMap(p => p.runs.map(r => r.id));
      const { data: existingPreds } = await supabase
        .from("b2_predictions")
        .select("picked_run_id, opponent_run_id, band, status, settled_at")
        .eq("user_id", currentUser.id)
        .in("picked_run_id", allRunIds);

      if (existingPreds && existingPreds.length > 0) {
        const restoredStates: Record<number, { pickedRunId: string | null; selectedBand: Band | null; submitted: boolean; hotVotes: Set<string> }> = {};
        validPairs.forEach((pair, idx) => {
          const pairRunIds = new Set(pair.runs.map(r => r.id));
          const match = existingPreds.find(p => pairRunIds.has(p.picked_run_id));
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
          setPairStates(prev => ({ ...prev, ...restoredStates }));
          // Auto-collapse restored submitted battles
          setCollapsedPairs(new Set(Object.keys(restoredStates).map(Number)));
        }

        const restoredPredictions: Prediction[] = existingPreds.map(p => {
          const pair = validPairs.find(vp => vp.runs.some(r => r.id === p.picked_run_id));
          const pickedRun = pair?.runs.find(r => r.id === p.picked_run_id);
          const opponentRun = pair?.runs.find(r => r.id === p.opponent_run_id);
          return {
            pickedRunId: p.picked_run_id,
            opponentRunId: p.opponent_run_id,
            band: p.band as Band,
            pickedStarName: pickedRun?.star?.display_name || "Unknown",
            opponentStarName: opponentRun?.star?.display_name || "Unknown",
            status: (p as any).status || "pending",
            created_at: new Date().toISOString(),
          };
        });
        setPredictions(restoredPredictions);
      }
    }

    setLoading(false);
  }

  function handlePick(pairIdx: number, runId: string) {
    const state = getPairState(pairIdx);
    if (state.submitted) return;
    if (!user) {
      toast({ title: "Please log in to participate.", variant: "destructive" });
      navigate("/login");
      return;
    }
    updatePairState(pairIdx, { pickedRunId: state.pickedRunId === runId ? null : runId, selectedBand: null });
  }

  function handleBandSelect(pairIdx: number, band: Band) {
    const state = getPairState(pairIdx);
    if (state.submitted || !state.pickedRunId) return;
    updatePairState(pairIdx, { selectedBand: state.selectedBand === band ? null : band });
  }

  function handleSubmit(pairIdx: number) {
    const pair = battlePairs[pairIdx];
    const state = getPairState(pairIdx);
    if (!state.pickedRunId || !state.selectedBand || !pair) return;
    const pairRuns = pair.runs;
    const opponentRun = pairRuns.find((r) => r.id !== state.pickedRunId);
    if (!opponentRun) return;

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
    // Auto-collapse submitted battle in live tab
    setCollapsedPairs(prev => new Set(prev).add(pairIdx));

    const capturedPickedRunId = state.pickedRunId;
    const capturedSelectedBand = state.selectedBand;

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      try {
        const { data: ticketResult, error: ticketError } = await supabase.rpc("ktrenz_use_prediction_ticket" as any, { _user_id: user.id });
        if (ticketError) console.error("[Battle] ticket RPC error:", ticketError);
        else console.log("[Battle] ticket used:", ticketResult);
        await loadTickets();
        const { error: predError } = await supabase.from("b2_predictions").insert({
          user_id: user.id,
          picked_run_id: capturedPickedRunId,
          opponent_run_id: opponentRun.id,
          band: capturedSelectedBand,
        });
        if (predError) console.error("[Battle] prediction insert error:", predError);
      } catch (e) {
        console.error("[Battle] submit error:", e);
      }
    });
  }


  if (loading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-48 h-2 rounded-full overflow-hidden bg-muted">
            <div
              className="h-full rounded-full animate-[shimmer_1.5s_ease-in-out_infinite]"
              style={{
                background: "linear-gradient(90deg, #ff6b6b, #ffa94d, #ffd43b, #69db7c, #4dabf7, #9775fa, #ff6b6b)",
                backgroundSize: "200% 100%",
                animation: "shimmer 1.5s ease-in-out infinite",
              }}
            />
          </div>
          <p className="text-muted-foreground text-sm">{t("loading")}</p>
        </div>
        <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-muted/30">
      <SEO
        title="KTrenZ – K-Pop Content Battle"
        titleKo="KTrenZ – K-Pop 콘텐츠 배틀"
        description="Predict which K-Pop content wins each round. Vote, earn K-Cash, and climb the leaderboard."
        descriptionKo="어떤 K-Pop 콘텐츠가 이길지 예측하세요. 투표하고, K-Cash를 모으고, 리더보드에 도전하세요."
        path="/"
      />
      <div className="fixed top-0 left-0 right-0 z-50 bg-card">
        <V3Header rightSlot={
          <button onClick={() => setShowTicketInfo(true)} className="flex items-center gap-1.5 active:opacity-60 transition-opacity">
            <Ticket className="w-5 h-5 text-primary" />
            <span className="text-base font-extrabold text-primary">{remainingTickets}</span>
          </button>
        } />
      </div>
      <TicketInfoPopup open={showTicketInfo} onClose={() => setShowTicketInfo(false)} remaining={remainingTickets} total={totalTickets} />

      <div className="pt-16 pb-24 space-y-5">
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
                  {tab.label} {count > 0 && <span className="ml-0.5 opacity-70">{count}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* My Bets tab: show history at top */}
        {battleFilter === "myBets" && predictions.length > 0 && (
          <div className="max-w-lg sm:max-w-4xl mx-auto px-4 space-y-5 mb-4">
            <div className="pb-2">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-card border border-border text-sm font-semibold text-foreground"
              >
                <span className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-primary" />
                  {t("historyTab")} ({predictions.length})
                </span>
                <ChevronDown className={`w-4 h-4 transition-transform ${showHistory ? "rotate-180" : ""}`} />
              </button>

              {showHistory && (
                <div className="mt-2 space-y-2 animate-in fade-in slide-in-from-top-2">
                  {predictions.map((pred, i) => (
                    <div key={i} className="rounded-xl bg-card border border-border p-3 flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {pred.pickedStarName} <span className="text-muted-foreground font-normal">vs</span> {pred.opponentStarName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t(pred.band === "steady" ? "bandSteady" : pred.band === "rising" ? "bandRising" : "bandSurge")} · {BANDS.find((b) => b.key === pred.band)?.range}
                        </p>
                      </div>
                      <Badge variant="outline" className="ml-2 shrink-0">
                        {t(pred.status === "pending" ? "pending" : pred.status === "won" ? "won" : "lost")}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Filtered battle pairs */}
        {battlePairs.map((pair, pairIdx) => {
          // Filter logic
          const state = getPairState(pairIdx);
          const pred = predictions.find(p => p.pickedRunId === state.pickedRunId);
          if (battleFilter === "live" && state.submitted && pred?.status !== "pending") return null;
          if (battleFilter === "settled" && (!state.submitted || pred?.status === "pending")) return null;
          if (battleFilter === "myBets" && !state.submitted) return null;

          const isLocked = pairIdx >= unlockedBattleCount;
          const pairState = getPairState(pairIdx);
          const pairRuns = pair.runs;
          const pairItems = pair.items;
          const pickedRun = pairRuns.find((r) => r.id === pairState.pickedRunId);

          return (
            <div key={pairIdx} className={cn("space-y-5 relative", isLocked && "opacity-40 pointer-events-none select-none")}>
              <div
                className={cn("flex items-center gap-3 px-6 max-w-lg sm:max-w-4xl mx-auto", pairIdx > 0 ? "my-10" : "mb-5", battleFilter === "live" && pairState.submitted && "cursor-pointer")}
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
                <div className="flex-1 h-px bg-primary/30" />
                <span className={cn("text-[11px] font-bold uppercase tracking-widest rounded-full px-4 py-1.5 border ring-1 flex items-center gap-1.5", getPairState(pairIdx).submitted ? "bg-green-500 text-white border-green-400 ring-green-400/30" : "bg-primary text-primary-foreground border-primary/40 ring-primary/30")}>
                  Battle {pairIdx + 1}{getPairState(pairIdx).submitted ? ` ✓ ${t("joined")}` : ""}
                  {battleFilter === "live" && pairState.submitted && (
                    <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", collapsedPairs.has(pairIdx) && "rotate-180")} />
                  )}
                </span>
                <div className="flex-1 h-px bg-primary/30" />
              </div>

              {/* Lock overlay for tier-restricted battles */}
              {isLocked && (
                <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-auto">
                  <div className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-card/90 border border-border shadow-lg">
                    <Lock className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">{nextTierName} {language === "ko" ? "등급부터 참여 가능" : "tier required"}</span>
                  </div>
                </div>
              )}

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
                        <span className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest">vs</span>
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

              {/* Band Selection + Submit — constrained width */}
              <div className="max-w-lg sm:max-w-4xl mx-auto px-4 space-y-5">
                {pairState.pickedRunId && !pairState.submitted && (
                  <div className="rounded-2xl bg-card border border-border p-4 space-y-3 animate-in fade-in slide-in-from-bottom-2">
                    <p className="text-sm font-semibold text-foreground flex items-center gap-1">
                      {t("predictGrowth")} <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" /> <span className="text-primary">{pickedRun?.star?.display_name}</span>
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {BANDS.map((band) => {
                        const isSelected = pairState.selectedBand === band.key;
                        const BandIcon = band.icon;
                        const bandLabel = t(band.key === "steady" ? "bandSteady" : band.key === "rising" ? "bandRising" : "bandSurge");
                        return (
                          <button
                            key={band.key}
                            onClick={() => handleBandSelect(pairIdx, band.key)}
                            className={`rounded-xl px-2 py-3 sm:px-3 sm:py-4 text-center transition-all bg-white text-foreground aspect-square flex flex-col items-center justify-center ${isSelected ? "ring-2 ring-primary scale-[1.03]" : "hover:ring-1 hover:ring-primary/30"}`}
                          >
                            <BandIcon className={`w-6 h-6 sm:w-8 sm:h-8 mb-1 ${band.iconColor}`} />
                            <span className="text-[10px] sm:text-xs font-medium">{bandLabel}</span>
                            <span className="text-base sm:text-lg font-extrabold mt-0.5">{band.range}</span>
                            <span className="text-[10px] sm:text-xs font-bold text-muted-foreground mt-0.5">+{band.reward.toLocaleString()} K</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Submit / Result */}
                {!pairState.submitted ? (
                  pairState.pickedRunId && pairState.selectedBand ? (
                    <Button onClick={() => handleSubmit(pairIdx)} className="w-full h-12 rounded-2xl text-base font-bold animate-in fade-in slide-in-from-bottom-2">
                      <Zap className="w-5 h-5 mr-2" />
                      {t("submitPrediction")}
                      <span className="ml-2 text-xs font-normal opacity-70">
                        +{BANDS.find((b) => b.key === pairState.selectedBand)?.reward.toLocaleString()} K-Cashes
                      </span>
                    </Button>
                  ) : null
                ) : (
                  battleFilter !== "myBets" && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                      <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
                        <p className="text-sm font-bold text-foreground flex items-center gap-2">
                          <Trophy className="w-4 h-4 text-primary" />
                          {t("predictionSubmitted")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {language === "ko" ? "다음 콘텐츠 스캔 후 결과가 정산됩니다." : language === "ja" ? "次回のコンテンツスキャン後に結果が確定します。" : language === "zh" ? "结果将在下次内容扫描后结算。" : "Results will be settled after the next content scan."}
                          <br />
                          {(() => {
                            const now = new Date();
                            const tomorrow = new Date(now);
                            tomorrow.setDate(tomorrow.getDate() + 1);
                            tomorrow.setHours(0, 0, 0, 0);
                            const diff = Math.max(0, Math.floor((tomorrow.getTime() - now.getTime()) / 1000));
                            const h = Math.floor(diff / 3600);
                            const m = Math.floor((diff % 3600) / 60);
                            const hLabel = language === "ko" ? "시간" : language === "ja" ? "時間" : language === "zh" ? "小时" : "h";
                            const mLabel = language === "ko" ? "분" : language === "ja" ? "分" : language === "zh" ? "分钟" : "m";
                            const timeStr = h > 0 ? `${h}${hLabel} ${m}${mLabel}` : `${m}${mLabel}`;
                            return language === "ko" ? `약 ${timeStr} 후 확인하세요.` : language === "ja" ? `約${timeStr}後にご確認ください。` : language === "zh" ? `请约${timeStr}后查看。` : `Check back in ~${timeStr}.`;
                          })()}
                        </p>
                        <div className="flex items-center justify-between bg-card rounded-xl p-4 border border-border min-h-[72px]">
                          <div>
                            <p className="text-base font-semibold text-foreground">{pickedRun?.star?.display_name}</p>
                            <p className="text-sm text-muted-foreground mt-1">{t("scoreLabel")}: {pickedRun?.content_score}</p>
                          </div>
                          <div className="text-right space-y-1">
                            <p className="text-xs font-medium text-muted-foreground">
                              {t(pairState.selectedBand === "steady" ? "bandSteady" : pairState.selectedBand === "rising" ? "bandRising" : "bandSurge")} {language === "ko" ? "오름 예측" : language === "ja" ? "上昇予測" : language === "zh" ? "上涨预测" : "rise predicted"}
                            </p>
                            <p className="text-sm font-bold text-foreground flex items-center justify-end gap-1">
                              {language === "ko" ? "보상" : language === "ja" ? "報酬" : language === "zh" ? "奖励" : "Reward"} {BANDS.find((b) => b.key === pairState.selectedBand)?.reward.toLocaleString()}
                              💎
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                )}
              </div>
              </>
              )}
            </div>
          );
        })}

        {/* Empty state for filter */}
        {battlePairs.every((_, idx) => {
          const s = getPairState(idx);
          const p = predictions.find(pr => pr.pickedRunId === s.pickedRunId);
          if (battleFilter === "live") return s.submitted && p?.status !== "pending";
          if (battleFilter === "settled") return !s.submitted || p?.status === "pending";
          if (battleFilter === "myBets") return !s.submitted;
          return false;
        }) && (
          <div className="text-center py-12 text-muted-foreground text-sm">
            {battleFilter === "settled"
              ? (language === "ko" ? "정산된 배틀이 없습니다" : "No settled battles yet")
              : battleFilter === "myBets"
              ? (language === "ko" ? "참여한 배틀이 없습니다" : "No battles joined yet")
              : (language === "ko" ? "라이브 배틀이 없습니다" : "No live battles")}
          </div>
        )}

      </div>

      {/* Detail Drawer */}
      <Sheet open={!!drawerItem} onOpenChange={(open) => !open && setDrawerItem(null)}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[90vh] overflow-y-auto mx-auto max-w-lg focus:outline-none focus-visible:outline-none focus-visible:ring-0" hideClose>
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

                    // Instagram embed
                    if (source === "instagram" && url) {
                      const instaMatch = url.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
                      const shortcode = instaMatch?.[2] || meta.embed_shortcode;
                      if (shortcode) {
                        const instaType = instaMatch?.[1] || "p";
                        const embedPath = instaType === "reel" ? "reel" : "p";
                        return (
                          <iframe
                            src={`https://www.instagram.com/${embedPath}/${shortcode}/embed/?autoplay=1`}
                            className="w-full border-0"
                            style={{ height: "480px" }}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            referrerPolicy="no-referrer"
                          />
                        );
                      }
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
                  const desc = drawerItem.description;
                  if (!desc) return null;
                  // Filter CSS code, template vars, or heavily garbled text
                  if (/^\.[\w_]+\s*\{/.test(desc.trim())) return null;
                  if (/\{\{[\w#\/]/.test(desc)) return null;
                  // Check for garbled encoding: high ratio of replacement/control chars
                  const garbledCount = (desc.match(/[\x00-\x08\uFFFD]/g) || []).length;
                  if (garbledCount > 5) return null;
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
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[80vh] overflow-y-auto mx-2 mb-0">
          <SheetHeader>
            <SheetTitle className="text-base font-bold flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              {insightDrawer?.starName} Trend Report
            </SheetTitle>
          </SheetHeader>
          <div className="py-4 space-y-4">
            {insightLoading && !insightData[`${insightDrawer?.runId}-${insightDrawer?.starId}`] ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                <p className="text-sm text-muted-foreground">Generating trend analysis...</p>
              </div>
            ) : (() => {
              const key = `${insightDrawer?.runId}-${insightDrawer?.starId}`;
              const data = insightData[key];
              if (!data) return <p className="text-sm text-muted-foreground text-center py-8">No data available</p>;
              return (
                <div className="space-y-4">
                  {data.headline && (
                    <div className="rounded-xl bg-primary/5 border border-primary/10 p-4">
                      <p className="text-lg font-bold text-foreground">{data.headline}</p>
                    </div>
                  )}
                  {data.bullets && data.bullets.length > 0 && (
                    <div className="space-y-3">
                      {data.bullets.map((bullet, i) => (
                        <div key={i} className="flex gap-3 items-start">
                          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-xs font-bold text-primary">{i + 1}</span>
                          </div>
                          <p className="text-sm text-foreground leading-relaxed">{bullet}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {data.vibe && (
                    <div className="flex items-center gap-2 pt-2">
                      <span className="text-xs text-muted-foreground">Trend Vibe:</span>
                      <Badge variant="secondary" className={cn(
                        "text-xs",
                        data.vibe === "hot" && "bg-red-500/10 text-red-600",
                        data.vibe === "rising" && "bg-orange-500/10 text-orange-600",
                        data.vibe === "steady" && "bg-emerald-500/10 text-emerald-600",
                      )}>
                        {data.vibe === "hot" ? "🔥 Hot" : data.vibe === "rising" ? "📈 Rising" : "✅ Steady"}
                      </Badge>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </SheetContent>
      </Sheet>

      <V3TabBar activeTab="battle" onTabChange={() => {}} />
    </div>
  );
}
