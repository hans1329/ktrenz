import { useState, useEffect, useRef, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Zap, Trophy, TrendingUp, Clock, ChevronLeft, ChevronRight, ExternalLink, Flame, Share2, Play, Music, Camera, Newspaper, MessageCircle, FileText, Sprout, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import V3Header from "@/components/v3/V3Header";
import V3TabBar from "@/components/v3/V3TabBar";
import { usePageTranslation } from "@/hooks/usePageTranslation";
import SmartImage from "@/components/SmartImage";

interface B2Item {
  id: string;
  source: string;
  title: string;
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

const BANDS: { key: Band; label: string; range: string; icon: typeof Sprout; multiplier: string }[] = [
  { key: "steady", label: "Steady", range: "0–30%", icon: Sprout, multiplier: "×1.5" },
  { key: "rising", label: "Rising", range: "30–80%", icon: Flame, multiplier: "×3.0" },
  { key: "surge", label: "Surge", range: "80%+", icon: Rocket, multiplier: "×6.0" },
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
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
      setActiveIndex(closest);
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [runItems.length]);

  const scrollToIndex = (i: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const child = el.children[i] as HTMLElement;
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
            isPicked ? "bg-muted/60 border-primary/30 shadow-primary/10" : "bg-card border-transparent hover:bg-muted/50"
          } ${disabled ? "opacity-60" : ""}`}
        >
          <div className="flex items-center gap-1.5">
            <span className="text-sm sm:text-base font-extrabold text-foreground">{index === 0 ? "A" : "B"} ·</span>
            <span className="text-xs sm:text-sm text-muted-foreground">by</span>
            <span className="text-sm sm:text-base font-bold text-foreground">{starName}</span>
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
        className="flex gap-2.5 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-1 -mx-1 px-1"
      >
        {runItems.map((item) => (
          <div
            key={item.id}
            className="snap-center flex-shrink-0 w-[85%] sm:w-72 lg:w-80 cursor-pointer"
            onClick={() => onCardTap(item)}
          >
            <div className="relative aspect-square rounded-xl overflow-hidden bg-muted">
              {item.thumbnail ? (
                <SmartImage src={item.thumbnail} alt={item.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground text-[10px]">No image</div>
              )}
              {/* source icon */}
              <div className="absolute top-1.5 right-1.5">
                {sourceIcon(item.source)}
              </div>
              {/* title overlay */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-10">
                <p className="text-white text-xs font-medium leading-snug line-clamp-2">
                  {decodeHtml(item.title)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Carousel indicators */}
      {runItems.length > 1 && (
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

/* ── Main Battle Page ── */
export default function Battle() {
  const navigate = useNavigate();
  const { t } = usePageTranslation({
    cacheKey: "battle",
    segments: {
      loading: "Loading battles...",
      title: "Trend Battle",
      subtitle: "Predict the next content surge",
      howItWorks: "How it works",
      instruction: "Pick the artist you think will grow more, then predict their growth band. The tighter the band, the bigger the reward!",
      nextSettlement: "Next settlement in",
      contentScore: "Score",
      pickWinner: "Who will grow more?",
      predictGrowth: "Your pick:",
      bandSteady: "Steady",
      bandRising: "Rising",
      bandSurge: "Surge",
      submitPrediction: "Submit Prediction",
      predictionSubmitted: "Prediction Submitted!",
      waitResult: "Results will be settled after the next content scan. Check back in ~24 hours.",
      dailyRemaining: "Daily free battles remaining:",
      contentDetail: "Content Detail",
      source: "Source",
      published: "Published",
    },
  });

  const [runs, setRuns] = useState<B2Run[]>([]);
  const [items, setItems] = useState<Record<string, B2Item[]>>({});
  const [pickedRunId, setPickedRunId] = useState<string | null>(null);
  const [selectedBand, setSelectedBand] = useState<Band | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [drawerItem, setDrawerItem] = useState<B2Item | null>(null);
  const [hotVotes, setHotVotes] = useState<Set<string>>(new Set()); // item IDs that got 🔥

  // Count hot votes per run's star_id
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

  useEffect(() => { loadBattleData(); }, []);

  async function loadBattleData() {
    const { data: runsData } = await supabase
      .from("ktrenz_b2_runs")
      .select("id, star_id, content_score, counts, created_at")
      .order("created_at", { ascending: false })
      .limit(20);

    if (!runsData?.length) { setLoading(false); return; }

    const latestByStarMap = new Map<string, any>();
    for (const r of runsData) {
      if (!latestByStarMap.has(r.star_id)) latestByStarMap.set(r.star_id, r);
    }
    const latestRuns = Array.from(latestByStarMap.values()).slice(0, 2);

    const starIds = latestRuns.map((r: any) => r.star_id);
    const { data: stars } = await supabase
      .from("ktrenz_stars")
      .select("id, display_name, name_ko")
      .in("id", starIds);

    const starMap = new Map((stars || []).map((s: any) => [s.id, s]));
    const enrichedRuns = latestRuns.map((r: any) => ({ ...r, star: starMap.get(r.star_id) }));
    setRuns(enrichedRuns);

    const itemsByRun: Record<string, B2Item[]> = {};
    for (const run of enrichedRuns) {
      const { data: runItems } = await supabase
        .from("ktrenz_b2_items")
        .select("id, source, title, description, url, thumbnail, has_thumbnail, engagement_score, star_id, published_at, metadata")
        .eq("run_id", run.id)
        .eq("has_thumbnail", true)
        .not("source", "eq", "naver_blog")
        .order("engagement_score", { ascending: false })
        .limit(8);
      itemsByRun[run.id] = (runItems || []) as B2Item[];
    }
    setItems(itemsByRun);
    setLoading(false);
  }

  function handlePick(runId: string) {
    if (submitted) return;
    setPickedRunId(runId);
    setSelectedBand(null);
  }

  function handleBandSelect(band: Band) {
    if (submitted || !pickedRunId) return;
    setSelectedBand(band);
  }

  function handleSubmit() {
    if (!pickedRunId || !selectedBand) return;
    setSubmitted(true);
  }

  const pickedRun = runs.find((r) => r.id === pickedRunId);

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
            어떤 트렌드가 내일 더 유행할까요?
          </h2>
          <FlipTimer />
        </div>

        {/* Card carousels — full width */}
        <div className="w-full px-2 sm:px-4 space-y-2">
          {runs.map((run, idx) => (
            <div key={run.id} className="space-y-2">
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
          ))}
        </div>

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
                      className={`rounded-xl px-3 py-4 text-center transition-all border-2 bg-white text-foreground ${isSelected ? "border-primary ring-2 ring-primary/20 scale-[1.03]" : "border-border hover:border-primary/30"}`}
                    >
                      <BandIcon className="w-8 h-8 mx-auto mb-1.5 text-foreground" />
                      <span className="text-xs font-medium block">{bandLabel}</span>
                      <span className="text-lg font-extrabold block mt-1">{band.range}</span>
                      <span className="text-xs font-bold block mt-1 text-muted-foreground">{band.multiplier}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Submit / Result */}
          {!submitted ? (
            <Button onClick={handleSubmit} disabled={!pickedRunId || !selectedBand} className="w-full h-12 rounded-2xl text-base font-bold">
              <Zap className="w-5 h-5 mr-2" />
              {t("submitPrediction")}
            </Button>
          ) : (
            <div className="rounded-2xl bg-primary/5 border border-primary/20 p-4 space-y-3">
              <p className="text-sm font-bold text-foreground flex items-center gap-2">
                <Trophy className="w-4 h-4 text-primary" />
                {t("predictionSubmitted")}
              </p>
              <p className="text-xs text-muted-foreground">{t("waitResult")}</p>
              <div className="flex items-center justify-between bg-card rounded-xl p-3 border border-border">
                <div>
                  <p className="text-sm font-semibold text-foreground">{pickedRun?.star?.display_name}</p>
                  <p className="text-xs text-muted-foreground">Score: {pickedRun?.content_score}</p>
                </div>
                <Badge variant="outline">
                  {BANDS.find((b) => b.key === selectedBand)?.label} {BANDS.find((b) => b.key === selectedBand)?.multiplier}
                </Badge>
              </div>
              <div className="pt-2 border-t border-border mt-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">🎧 Spotify Premium</span>
                  <span className="text-xs font-semibold text-foreground">1,250 / 9,000 K-Cashes</span>
                </div>
                <Progress value={(1250 / 9000) * 100} className="h-2" />
              </div>
            </div>
          )}

          <div className="text-center pb-4">
            <p className="text-xs text-muted-foreground">
              {t("dailyRemaining")} <span className="font-bold text-foreground">2 / 3</span>
            </p>
          </div>
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

                {/* Large thumbnail */}
                <div className="rounded-2xl overflow-hidden bg-muted mb-4">
                  {drawerItem.thumbnail ? (
                    <SmartImage src={drawerItem.thumbnail} alt={drawerItem.title} className="w-full h-auto" />
                  ) : (
                    <div className="w-full aspect-video bg-muted" />
                  )}
                </div>

                {/* Title */}
                <h3 className="text-base font-semibold text-foreground leading-snug mb-2">{decodeHtml(drawerItem.title)}</h3>

                {/* Description */}
                {drawerItem.description && (
                  <p className="text-sm text-muted-foreground leading-relaxed mb-2">
                    {decodeHtml(drawerItem.description)}
                  </p>
                )}

                {/* External link - separate row, right-aligned */}
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
                  {hotVotes.has(drawerItem.id) ? "Hot!" : "Mark as Hot"}
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
