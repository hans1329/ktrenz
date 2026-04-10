import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Zap, Trophy, TrendingUp, Clock, ChevronLeft, ChevronRight, ExternalLink, Flame, Share2, Play, Music, Camera, Newspaper, MessageCircle, FileText, Sprout, Rocket, ChevronDown, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import V3Header from "@/components/v3/V3Header";
import V3TabBar from "@/components/v3/V3TabBar";
import { useLanguage } from "@/contexts/LanguageContext";
import SmartImage from "@/components/SmartImage";
import { toast } from "@/hooks/use-toast";

interface B2Item {
  id: string;
  source: string;
  title: string;
  title_en: string | null;
  title_ja: string | null;
  title_zh: string | null;
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
  star?: { display_name: string; name_ko: string };
}

type Band = "steady" | "rising" | "surge";

const BANDS: { key: Band; label: string; range: string; icon: typeof Sprout; iconColor: string; reward: number }[] = [
  { key: "steady", label: "Steady", range: "15–30%", icon: Sprout, iconColor: "text-emerald-500", reward: 100 },
  { key: "rising", label: "Rising", range: "30–80%", icon: Flame, iconColor: "text-orange-500", reward: 300 },
  { key: "surge", label: "Surge", range: "80%+", icon: Rocket, iconColor: "text-red-500", reward: 1000 },
];

function decodeHtml(str: string) {
  return str.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&apos;/g, "'");
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
  if (lang === "ja" && item.title_ja) return item.title_ja;
  if (lang === "zh" && item.title_zh) return item.title_zh;
  if (lang === "en" && item.title_en) return item.title_en;
  return item.title;
}

/* ── Artist Section: name bar + horizontal card carousel ── */
function ArtistSection({
  runItems,
  starName,
  contentScore,
  scoreLabel,
  isPicked,
  onPick,
  onCardTap,
  disabled,
  index,
}: {
  runItems: B2Item[];
  starName: string;
  contentScore: number;
  scoreLabel: string;
  isPicked: boolean;
  onPick: () => void;
  onCardTap: (item: B2Item) => void;
  disabled: boolean;
  index: number;
}) {
  const { language } = useLanguage();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const itemCount = runItems.length;

  // Triple items for infinite loop: [clone-last-set] [original] [clone-first-set]
  const loopItems = itemCount > 1
    ? [...runItems, ...runItems, ...runItems]
    : runItems;
  const offset = itemCount > 1 ? itemCount : 0;

  // Initialize scroll to the middle (original) set
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || itemCount <= 1) return;
    requestAnimationFrame(() => {
      const child = el.children[offset] as HTMLElement;
      if (child) el.scrollLeft = child.offsetLeft - (el.offsetWidth - child.offsetWidth) / 2;
    });
  }, [itemCount, offset]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || itemCount <= 1) return;
    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const children = Array.from(el.children) as HTMLElement[];
        if (children.length === 0) return;
        const scrollLeft = el.scrollLeft;
        const containerWidth = el.offsetWidth;

        let closest = 0;
        let minDist = Infinity;
        children.forEach((child, i) => {
          const childCenter = child.offsetLeft + child.offsetWidth / 2;
          const dist = Math.abs(childCenter - scrollLeft - containerWidth / 2);
          if (dist < minDist) { minDist = dist; closest = i; }
        });

        setActiveIndex(closest % itemCount);

        // Reset to middle set when scrolling into clone zones
        const firstOriginal = children[offset];
        const lastOriginal = children[offset + itemCount - 1];
        if (!firstOriginal || !lastOriginal) return;

        const leftBound = firstOriginal.offsetLeft - containerWidth / 2;
        const rightBound = lastOriginal.offsetLeft + lastOriginal.offsetWidth - containerWidth / 2;

        if (scrollLeft < leftBound) {
          const jumpTarget = children[closest + itemCount];
          if (jumpTarget) el.scrollLeft = jumpTarget.offsetLeft - (containerWidth - jumpTarget.offsetWidth) / 2;
        } else if (scrollLeft > rightBound) {
          const jumpTarget = children[closest - itemCount];
          if (jumpTarget) el.scrollLeft = jumpTarget.offsetLeft - (containerWidth - jumpTarget.offsetWidth) / 2;
        }
      });
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [itemCount, offset]);

  const scrollToIndex = (i: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const child = el.children[i + offset] as HTMLElement;
    if (child) child.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  };

  return (
    <div className="space-y-2">
      {/* Pick bar — constrained width */}
      <div className="max-w-sm mx-auto sm:max-w-[80%] sm:mx-auto px-2 sm:px-0 mb-3">
        <button
          onClick={onPick}
          disabled={disabled}
          className={`w-full flex items-center justify-between px-4 py-4 rounded-full transition-all border shadow-sm ${
            isPicked ? "bg-white border-primary/30 shadow-primary/10" : "bg-white border-transparent hover:bg-white/90"
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

      {/* Horizontal card carousel (infinite loop) */}
      <div
        ref={scrollRef}
        className="flex gap-2.5 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-1 -mx-1 px-1 sm:max-w-[80%] sm:mx-auto"
      >
        {loopItems.map((item, loopIdx) => (
          <div
            key={`${item.id}-${loopIdx}`}
            className="snap-center flex-shrink-0 w-[75%] sm:w-80 lg:w-96 cursor-pointer"
            onClick={() => onCardTap(item)}
          >
            <div className="rounded-xl overflow-hidden bg-card border border-primary/10">
              {/* Square image */}
              <div className="relative aspect-square bg-muted">
                {item.thumbnail ? (
                  <SmartImage src={item.thumbnail} alt={item.title} className="w-full h-full object-cover" />
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
  const { user } = useAuth();
  const { t: globalT } = useLanguage();
  const t = (key: string) => globalT(`battle.${key}`);

  const [battlePairs, setBattlePairs] = useState<BattlePair[]>([]);
  const [currentPairIndex, setCurrentPairIndex] = useState(0);
  const [pickedRunId, setPickedRunId] = useState<string | null>(null);
  const [selectedBand, setSelectedBand] = useState<Band | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [drawerItem, setDrawerItem] = useState<B2Item | null>(null);
  const [hotVotes, setHotVotes] = useState<Set<string>>(new Set());
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [ticketInfo, setTicketInfo] = useState<{ remaining: number; total: number; used: number } | null>(null);

  const currentPair = battlePairs[currentPairIndex];
  const runs = currentPair?.runs || [];
  const items = currentPair?.items || {};
  const remainingTickets = ticketInfo?.remaining ?? 3;
  const totalTickets = ticketInfo?.total ?? 3;

  function getHotBonus(runId: string): number {
    const runItems = items[runId] || [];
    const count = runItems.filter((i) => hotVotes.has(i.id)).length;
    return count * 0.2;
  }

  function toggleHot(itemId: string) {
    setHotVotes((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
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

  async function loadBattleData() {
    // Load runs — get enough stars for multiple pairs
    const { data: runsData } = await supabase
      .from("ktrenz_b2_runs")
      .select("id, star_id, content_score, counts, created_at")
      .order("created_at", { ascending: false })
      .limit(40);

    if (!runsData?.length) { setLoading(false); return; }

    // Get latest run per star
    const latestByStarMap = new Map<string, any>();
    for (const r of runsData) {
      if (!latestByStarMap.has(r.star_id)) latestByStarMap.set(r.star_id, r);
    }
    const allRuns = Array.from(latestByStarMap.values());

    // Get star info
    const starIds = allRuns.map((r: any) => r.star_id);
    const { data: stars } = await supabase
      .from("ktrenz_stars")
      .select("id, display_name, name_ko")
      .in("id", starIds);

    const starMap = new Map((stars || []).map((s: any) => [s.id, s]));
    const enrichedRuns = allRuns.map((r: any) => ({ ...r, star: starMap.get(r.star_id) }));

    // Create pairs of 2
    const pairs: BattlePair[] = [];
    for (let i = 0; i + 1 < enrichedRuns.length && pairs.length < 10; i += 2) {
      const pairRuns = [enrichedRuns[i], enrichedRuns[i + 1]];
      pairs.push({ runs: pairRuns, items: {} });
    }

    // Load items for all pairs
    for (const pair of pairs) {
      for (const run of pair.runs) {
        const { data: runItems } = await supabase
          .from("ktrenz_b2_items")
          .select("id, source, title, title_en, title_ja, title_zh, description, url, thumbnail, has_thumbnail, engagement_score, star_id, published_at, metadata")
          .eq("run_id", run.id)
          .eq("has_thumbnail", true)
          .not("source", "eq", "naver_blog")
          .order("engagement_score", { ascending: false })
          .limit(8);
        pair.items[run.id] = (runItems || []) as B2Item[];
      }
    }

    setBattlePairs(pairs);
    setLoading(false);
  }

  function handlePick(runId: string) {
    if (submitted) return;
    if (!user) {
      toast({ title: "Please log in to participate.", variant: "destructive" });
      navigate("/login");
      return;
    }
    setPickedRunId(runId);
    setSelectedBand(null);
  }

  function handleBandSelect(band: Band) {
    if (submitted || !pickedRunId) return;
    setSelectedBand(band);
  }

  function handleSubmit() {
    if (!pickedRunId || !selectedBand || !currentPair) return;
    const opponentRun = runs.find((r) => r.id !== pickedRunId);
    if (!opponentRun) return;

    const prediction: Prediction = {
      pickedRunId,
      opponentRunId: opponentRun.id,
      band: selectedBand,
      pickedStarName: runs.find((r) => r.id === pickedRunId)?.star?.display_name || "Unknown",
      opponentStarName: opponentRun.star?.display_name || "Unknown",
      status: "pending",
      created_at: new Date().toISOString(),
    };

    setPredictions((prev) => [...prev, prediction]);
    setSubmitted(true);

    // Use ticket and save prediction
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        console.warn("[Battle] No authenticated user found for ticket/prediction save");
        return;
      }
      try {
        // Use prediction ticket
        const { data: ticketResult, error: ticketError } = await supabase.rpc("ktrenz_use_prediction_ticket" as any, { _user_id: user.id });
        if (ticketError) console.error("[Battle] ticket RPC error:", ticketError);
        else console.log("[Battle] ticket used:", ticketResult);
        // Refresh ticket count
        await loadTickets();
        // Save prediction
        const { error: predError } = await supabase.from("b2_predictions").insert({
          user_id: user.id,
          picked_run_id: pickedRunId,
          opponent_run_id: opponentRun.id,
          band: selectedBand,
        });
        if (predError) console.error("[Battle] prediction insert error:", predError);
      } catch (e) {
        console.error("[Battle] submit error:", e);
      }
    });
  }

  function handleNextBattle() {
    if (currentPairIndex + 1 >= battlePairs.length || remainingTickets <= 0) return;
    setCurrentPairIndex((prev) => prev + 1);
    setPickedRunId(null);
    setSelectedBand(null);
    setSubmitted(false);
    setHotVotes(new Set());
  }

  const pickedRun = runs.find((r) => r.id === pickedRunId);
  const allBattlesDone = remainingTickets <= 0 || (submitted && currentPairIndex + 1 >= battlePairs.length);

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-3">
          <Zap className="w-8 h-8 text-primary" />
          <p className="text-muted-foreground text-sm">{t("loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="fixed top-0 left-0 right-0 z-50 bg-card/70 backdrop-blur-md">
        <V3Header />
      </div>

      <div className="pt-16 pb-24 space-y-5">
        {/* Title + Flip Timer */}
        <div className="text-center sm:text-left space-y-4 pt-6 pb-4 max-w-lg sm:max-w-4xl mx-auto px-4">
          <h2 className="text-xl text-foreground tracking-tight font-sans font-bold sm:text-3xl text-center">
            {t("pickWinner")}
          </h2>
          <FlipTimer />
        </div>

        {/* Card carousels — full width */}
        {currentPair && (
          <div className="w-full px-2 sm:px-4">
            {runs.map((run, idx) => (
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
                    runItems={items[run.id] || []}
                    starName={run.star?.display_name || "Unknown"}
                    contentScore={parseFloat((run.content_score + getHotBonus(run.id)).toFixed(1))}
                    scoreLabel={t("contentScore")}
                    isPicked={pickedRunId === run.id}
                    onPick={() => handlePick(run.id)}
                    onCardTap={(item) => setDrawerItem(item)}
                    disabled={submitted}
                    index={idx}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Band Selection + Submit — constrained width */}
        <div className="max-w-lg sm:max-w-4xl mx-auto px-4 space-y-5">
          {/* Band Selection */}
          {pickedRunId && !submitted && (
            <div className="rounded-2xl bg-card border border-border p-4 space-y-3 animate-in fade-in slide-in-from-bottom-2">
              <p className="text-sm font-semibold text-foreground">
                {t("predictGrowth")} <span className="text-primary">{pickedRun?.star?.display_name}</span>
              </p>
              <div className="grid grid-cols-3 gap-2">
                {BANDS.map((band) => {
                  const isSelected = selectedBand === band.key;
                  const BandIcon = band.icon;
                  const bandLabel = t(band.key === "steady" ? "bandSteady" : band.key === "rising" ? "bandRising" : "bandSurge");
                  return (
                    <button
                      key={band.key}
                      onClick={() => handleBandSelect(band.key)}
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
          {!submitted ? (
            pickedRunId && selectedBand ? (
              <Button onClick={handleSubmit} className="w-full h-12 rounded-2xl text-base font-bold animate-in fade-in slide-in-from-bottom-2">
                <Zap className="w-5 h-5 mr-2" />
                {t("submitPrediction")}
                <span className="ml-2 text-xs font-normal opacity-70">
                  +{BANDS.find((b) => b.key === selectedBand)?.reward.toLocaleString()} K-Cashes
                </span>
              </Button>
            ) : null
          ) : (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
              <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
                <p className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-primary" />
                  {t("predictionSubmitted")}
                </p>
                <p className="text-xs text-muted-foreground">{t("waitResult")}</p>
                <div className="flex items-center justify-between bg-card rounded-xl p-4 border border-border min-h-[72px]">
                  <div>
                    <p className="text-base font-semibold text-foreground">{pickedRun?.star?.display_name}</p>
                    <p className="text-sm text-muted-foreground mt-1">{t("scoreLabel")}: {pickedRun?.content_score}</p>
                  </div>
                  <Badge variant="outline" className="text-sm px-3 py-1">
                    {BANDS.find((b) => b.key === selectedBand)?.label} +{BANDS.find((b) => b.key === selectedBand)?.reward.toLocaleString()} K
                  </Badge>
                </div>
                <div className="pt-2 border-t border-border mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">🎧 {t("rewardProgress")}</span>
                    <span className="text-[10px] text-muted-foreground"><span className="font-bold text-foreground">1,250</span> / 9,000 K-Cashes</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-primary to-purple-500 transition-all"
                      style={{ width: `${(1250 / 9000) * 100}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Next Battle button */}
              {!allBattlesDone ? (
                <Button onClick={handleNextBattle} variant="outline" className="w-full h-12 rounded-2xl text-base font-bold">
                  <ChevronRight className="w-5 h-5 mr-2" />
                  {t("nextBattle")} ({remainingTickets - 1} {t("dailyRemaining").replace(":", "").trim()})
                </Button>
              ) : (
                <div className="rounded-2xl bg-primary/5 border border-primary/20 p-4 text-center">
                  <p className="text-sm font-bold text-foreground">🎉 {t("allDone")}</p>
                </div>
              )}
            </div>
          )}

          <div className="text-center pb-2">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
              {t("dailyRemaining")} <Ticket className="w-3.5 h-3.5 text-primary" /> <span className="font-bold text-foreground">{remainingTickets}</span>
            </p>
          </div>

          {/* History Section */}
          {predictions.length > 0 && (
            <div className="pb-4">
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
                          {BANDS.find((b) => b.key === pred.band)?.label} · {BANDS.find((b) => b.key === pred.band)?.range}
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
          )}
        </div>
      </div>

      {/* Detail Drawer */}
      <Sheet open={!!drawerItem} onOpenChange={(open) => !open && setDrawerItem(null)}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[90vh] overflow-y-auto mx-auto max-w-lg focus:outline-none focus-visible:outline-none focus-visible:ring-0" hideClose>
          {drawerItem && (() => {
            const starRun = runs.find((r) => r.star_id === drawerItem.star_id);
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
                            src={`https://www.youtube.com/embed/${ytId}?rel=0&autoplay=0`}
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
                            src={`https://www.tiktok.com/embed/v2/${tiktokId}`}
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
                        return (
                          <iframe
                            src={`https://www.instagram.com/p/${shortcode}/embed/`}
                            className="w-full border-0"
                            style={{ height: "480px" }}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            loading="lazy"
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
                <h3 className="text-base font-semibold text-foreground leading-snug mb-2">{decodeHtml(drawerItem.title)}</h3>

                {/* Description */}
                {drawerItem.description && (
                  <p className="text-sm text-muted-foreground leading-relaxed mb-2">
                    {decodeHtml(drawerItem.description)}
                  </p>
                )}

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
                  onClick={() => toggleHot(drawerItem.id)}
                  className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 transition-all text-sm font-semibold focus:outline-none focus-visible:outline-none focus-visible:ring-0 ${
                    hotVotes.has(drawerItem.id)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-primary"
                  }`}
                >
                  <Flame className={`w-4 h-4 ${hotVotes.has(drawerItem.id) ? "fill-current" : ""}`} />
                  {hotVotes.has(drawerItem.id) ? "Hot!" : t("markHot")}
                </button>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
      <V3TabBar activeTab="rankings" onTabChange={() => {}} />
    </div>
  );
}
