import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Zap, Trophy, TrendingUp, Clock, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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

const BANDS: { key: Band; label: string; range: string; color: string; multiplier: string }[] = [
  { key: "steady", label: "🔵 Steady", range: "0–30%", color: "bg-primary/10 text-primary", multiplier: "×1.5" },
  { key: "rising", label: "🟢 Rising", range: "30–80%", color: "bg-emerald-100 text-emerald-700", multiplier: "×3.0" },
  { key: "surge", label: "🔴 Surge", range: "80%+", color: "bg-destructive/10 text-destructive", multiplier: "×6.0" },
];

function sourceIcon(source: string) {
  switch (source) {
    case "youtube": return "▶️";
    case "tiktok": return "🎵";
    case "instagram": return "📷";
    case "naver_news": return "📰";
    
    case "reddit": return "💬";
    default: return "📄";
  }
}

/* ── Carousel of content cards for one run ── */
function ContentCarousel({
  runItems,
  starName,
  contentScore,
  scoreLabel,
  isPicked,
  onPick,
  onCardTap,
  disabled,
}: {
  runItems: B2Item[];
  starName: string;
  contentScore: number;
  scoreLabel: string;
  isPicked: boolean;
  onPick: () => void;
  onCardTap: (item: B2Item) => void;
  disabled: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);

  function scroll(dir: 1 | -1) {
    if (!scrollRef.current) return;
    const next = Math.max(0, Math.min(idx + dir, runItems.length - 1));
    setIdx(next);
    const card = scrollRef.current.children[next] as HTMLElement;
    card?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }

  return (
    <div className={`rounded-2xl border-2 transition-all overflow-hidden ${isPicked ? "border-primary ring-2 ring-primary/20" : "border-border"} ${disabled ? "opacity-60" : ""}`}>
      {/* artist bar + pick button */}
      <button
        onClick={onPick}
        disabled={disabled}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-card"
      >
        <span className="text-xs font-medium text-muted-foreground">by <span className="text-foreground font-semibold">{starName}</span></span>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-foreground">{contentScore}</span>
          <span className="text-[10px] text-muted-foreground">{scoreLabel}</span>
        </div>
      </button>

      {/* carousel */}
      <div className="relative">
        <div ref={scrollRef} className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide">
          {runItems.map((item) => (
            <div
              key={item.id}
              className="snap-center flex-shrink-0 w-full cursor-pointer"
              onClick={() => onCardTap(item)}
            >
              <div className="relative aspect-[3/4] bg-muted">
                {item.thumbnail ? (
                  <SmartImage src={item.thumbnail} alt={item.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground text-sm">No image</div>
                )}
                {/* source icon */}
                <div className="absolute top-2.5 right-2.5">
                  <span className="text-base drop-shadow-md">{sourceIcon(item.source)}</span>
                </div>
                {/* title overlay */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 pt-16">
                  <p className="text-white text-sm font-medium leading-snug line-clamp-3">
                    {item.title}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* nav arrows */}
        {runItems.length > 1 && (
          <>
            <button onClick={() => scroll(-1)} className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => scroll(1)} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white">
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}

        {/* dots */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
          {runItems.map((_, i) => (
            <span key={i} className={`w-1.5 h-1.5 rounded-full ${i === idx ? "bg-white" : "bg-white/40"}`} />
          ))}
        </div>
      </div>
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
      predictGrowth: "How much will they grow?",
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-3">
          <Zap className="w-8 h-8 text-primary" />
          <p className="text-muted-foreground text-sm">{t("loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              {t("title")}
            </h1>
            <p className="text-xs text-muted-foreground">{t("subtitle")}</p>
          </div>
          <Badge variant="outline" className="text-xs">
            <Trophy className="w-3 h-3 mr-1" />
            3 / 3
          </Badge>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-5">
        {/* Instruction */}
        <div className="rounded-2xl bg-card border border-border p-4 space-y-2">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            {t("howItWorks")}
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">{t("instruction")}</p>
          <div className="flex items-center gap-2 pt-1">
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{t("nextSettlement")} <span className="font-mono font-semibold text-foreground">23:41:08</span></span>
          </div>
        </div>

        {/* Pick label */}
        <p className="text-sm font-semibold text-foreground">{t("pickWinner")}</p>

        {/* Card carousels */}
        {runs.map((run, idx) => (
          <div key={run.id} className="space-y-2">
            <ContentCarousel
              runItems={items[run.id] || []}
              starName={run.star?.display_name || "Unknown"}
              contentScore={run.content_score}
              scoreLabel={t("contentScore")}
              isPicked={pickedRunId === run.id}
              onPick={() => handlePick(run.id)}
              onCardTap={(item) => setDrawerItem(item)}
              disabled={submitted}
            />
            {idx === 0 && runs.length > 1 && (
              <div className="flex justify-center py-1">
                <span className="text-sm font-black text-muted-foreground tracking-[0.3em]">VS</span>
              </div>
            )}
          </div>
        ))}

        {/* Band Selection */}
        {pickedRunId && !submitted && (
          <div className="rounded-2xl bg-card border border-border p-4 space-y-3 animate-in fade-in slide-in-from-bottom-2">
            <p className="text-sm font-semibold text-foreground">
              {t("predictGrowth")} — <span className="text-primary">{pickedRun?.star?.display_name}</span>
            </p>
            <div className="grid grid-cols-3 gap-2">
              {BANDS.map((band) => {
                const isSelected = selectedBand === band.key;
                return (
                  <button
                    key={band.key}
                    onClick={() => handleBandSelect(band.key)}
                    className={`rounded-xl px-3 py-3 text-center transition-all border-2 ${isSelected ? "border-primary ring-2 ring-primary/20 scale-[1.03]" : "border-transparent hover:border-border"} ${band.color}`}
                  >
                    <span className="text-sm font-semibold block">{band.label}</span>
                    <span className="text-[10px] opacity-70 block mt-0.5">{band.range}</span>
                    <span className="text-xs font-bold block mt-1">{band.multiplier}</span>
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
              <Badge className={BANDS.find((b) => b.key === selectedBand)?.color || ""}>
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

      {/* Detail Drawer */}
      <Sheet open={!!drawerItem} onOpenChange={(open) => !open && setDrawerItem(null)}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[90vh] overflow-y-auto mx-auto max-w-lg" hideClose>
          {drawerItem && (() => {
            const starRun = runs.find((r) => r.star_id === drawerItem.star_id);
            const meta = drawerItem.metadata || {};
            return (
              <>
                {/* Drag handle */}
                <div className="flex justify-center pt-2 pb-4">
                  <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
                </div>

                {/* Large thumbnail */}
                <div className="rounded-2xl overflow-hidden bg-muted mb-4">
                  {drawerItem.thumbnail ? (
                    <SmartImage src={drawerItem.thumbnail} alt={drawerItem.title} className="w-full h-auto" />
                  ) : (
                    <div className="w-full aspect-video bg-muted" />
                  )}
                </div>

                {/* Artist */}
                {starRun?.star && (
                  <p className="text-xs text-muted-foreground mb-2">
                    by {starRun.star.display_name}
                  </p>
                )}

                {/* Title */}
                <h3 className="text-base font-semibold text-foreground leading-snug mb-2">{drawerItem.title}</h3>

                {/* Description */}
                {drawerItem.description && (
                  <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                    {drawerItem.description.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')}
                  </p>
                )}

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {drawerItem.published_at && (
                    <div className="rounded-xl bg-muted/50 p-3">
                      <p className="text-[10px] text-muted-foreground mb-0.5">Published</p>
                      <p className="text-sm font-medium text-foreground">
                        {new Date(drawerItem.published_at).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                  <div className="rounded-xl bg-muted/50 p-3">
                    <p className="text-[10px] text-muted-foreground mb-0.5">Engagement</p>
                    <p className="text-sm font-medium text-foreground">{drawerItem.engagement_score}</p>
                  </div>
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

                {/* Open original link */}
                {(drawerItem.url || meta.url || meta.videoId) && (
                  <a
                    href={drawerItem.url || meta.url || (meta.videoId ? `https://www.youtube.com/watch?v=${meta.videoId}` : "#")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open original
                  </a>
                )}
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}
