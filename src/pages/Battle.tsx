import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Zap, Trophy, TrendingUp, Clock, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { usePageTranslation } from "@/hooks/usePageTranslation";
import SmartImage from "@/components/SmartImage";

interface B2Item {
  id: string;
  source: string;
  title: string;
  thumbnail: string | null;
  has_thumbnail: boolean;
  engagement_score: number;
  star_id: string;
  published_at: string | null;
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

type Band = "drop" | "flat" | "low" | "mid" | "high" | "surge";

const BANDS: { key: Band; label: string; range: string; color: string; multiplier: string }[] = [
  { key: "drop", label: "📉 Drop", range: "< 0%", color: "bg-muted text-muted-foreground", multiplier: "×3.0" },
  { key: "flat", label: "➡️ Flat", range: "0–10%", color: "bg-secondary text-secondary-foreground", multiplier: "×1.5" },
  { key: "low", label: "🔵 Steady", range: "10–30%", color: "bg-primary/10 text-primary", multiplier: "×2.0" },
  { key: "mid", label: "🟢 Rising", range: "30–60%", color: "bg-emerald-100 text-emerald-700", multiplier: "×3.0" },
  { key: "high", label: "🟡 Hot", range: "60–100%", color: "bg-amber-100 text-amber-700", multiplier: "×5.0" },
  { key: "surge", label: "🔴 Surge", range: "100%+", color: "bg-destructive/10 text-destructive", multiplier: "×8.0" },
];

export default function Battle() {
  const navigate = useNavigate();
  const { t } = usePageTranslation("battle");
  const [runs, setRuns] = useState<B2Run[]>([]);
  const [items, setItems] = useState<Record<string, B2Item[]>>({});
  const [selectedBands, setSelectedBands] = useState<Record<string, Band>>({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBattleData();
  }, []);

  async function loadBattleData() {
    // Get latest run per star
    const { data: runsData } = await supabase
      .from("ktrenz_b2_runs")
      .select("id, star_id, content_score, counts, created_at")
      .order("created_at", { ascending: false })
      .limit(20);

    if (!runsData?.length) { setLoading(false); return; }

    // Dedupe: latest run per star_id
    const latestByStarMap = new Map<string, any>();
    for (const r of runsData) {
      if (!latestByStarMap.has(r.star_id)) latestByStarMap.set(r.star_id, r);
    }
    const latestRuns = Array.from(latestByStarMap.values()).slice(0, 2);

    // Fetch star names
    const starIds = latestRuns.map((r: any) => r.star_id);
    const { data: stars } = await supabase
      .from("ktrenz_stars")
      .select("id, display_name, name_ko")
      .in("id", starIds);

    const starMap = new Map((stars || []).map((s: any) => [s.id, s]));
    const enrichedRuns = latestRuns.map((r: any) => ({ ...r, star: starMap.get(r.star_id) }));
    setRuns(enrichedRuns);

    // Fetch items with thumbnails for each run
    const itemsByRun: Record<string, B2Item[]> = {};
    for (const run of enrichedRuns) {
      const { data: runItems } = await supabase
        .from("ktrenz_b2_items")
        .select("id, source, title, thumbnail, has_thumbnail, engagement_score, star_id, published_at, metadata")
        .eq("run_id", run.id)
        .eq("has_thumbnail", true)
        .limit(8);
      itemsByRun[run.id] = (runItems || []) as B2Item[];
    }
    setItems(itemsByRun);
    setLoading(false);
  }

  function handleBandSelect(runId: string, band: Band) {
    if (submitted) return;
    setSelectedBands((prev) => ({ ...prev, [runId]: band }));
  }

  function handleSubmit() {
    if (Object.keys(selectedBands).length < runs.length) return;
    setSubmitted(true);
  }

  const allSelected = Object.keys(selectedBands).length >= runs.length;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-3">
          <Zap className="w-8 h-8 text-primary" />
          <p className="text-muted-foreground text-sm">{t("loading", "Loading battles...")}</p>
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
              {t("title", "Trend Battle")}
            </h1>
            <p className="text-xs text-muted-foreground">{t("subtitle", "Predict the next content surge")}</p>
          </div>
          <Badge variant="outline" className="text-xs">
            <Trophy className="w-3 h-3 mr-1" />
            3 / 3
          </Badge>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-6">
        {/* Instruction Card */}
        <div className="rounded-2xl bg-card border border-border p-4 space-y-2">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            {t("howItWorks", "How it works")}
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t("instruction", "Predict how much each artist's content score will change in the next 24 hours. Pick a growth band for each — the narrower the band, the higher the reward!")}
          </p>
          <div className="flex items-center gap-2 pt-1">
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{t("nextSettlement", "Next settlement in")} <span className="font-mono font-semibold text-foreground">23:41:08</span></span>
          </div>
        </div>

        {/* Battle Cards */}
        {runs.map((run) => {
          const runItems = items[run.id] || [];
          const selected = selectedBands[run.id];

          return (
            <div key={run.id} className="rounded-2xl bg-card border border-border overflow-hidden">
              {/* Star Header */}
              <div className="p-4 border-b border-border flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-foreground text-base">
                    {run.star?.display_name || "Unknown"}
                  </h2>
                  <p className="text-xs text-muted-foreground">{run.star?.name_ko}</p>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1">
                    <Flame className="w-4 h-4 text-primary" />
                    <span className="text-lg font-bold text-foreground">{run.content_score}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{t("contentScore", "Content Score")}</p>
                </div>
              </div>

              {/* Content Preview Carousel */}
              <div className="px-4 py-3">
                <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
                  {runItems.map((item) => (
                    <div key={item.id} className="flex-shrink-0 w-24">
                      <div className="w-24 h-24 rounded-xl overflow-hidden bg-muted relative">
                        {item.thumbnail ? (
                          <SmartImage
                            src={item.thumbnail}
                            alt={item.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                            No img
                          </div>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-1">
                          <span className="text-[9px] text-white font-medium uppercase">{item.source.replace("_", " ")}</span>
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2 leading-tight">
                        {item.title.substring(0, 50)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Band Selection */}
              <div className="px-4 pb-4">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  {t("predictGrowth", "Predict 24h growth")}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {BANDS.map((band) => {
                    const isSelected = selected === band.key;
                    return (
                      <button
                        key={band.key}
                        onClick={() => handleBandSelect(run.id, band.key)}
                        disabled={submitted}
                        className={`
                          rounded-xl px-3 py-2.5 text-left transition-all border-2
                          ${isSelected
                            ? "border-primary ring-2 ring-primary/20 scale-[1.02]"
                            : "border-transparent hover:border-border"
                          }
                          ${band.color}
                          ${submitted ? "opacity-60" : ""}
                        `}
                      >
                        <span className="text-xs font-semibold block">{band.label}</span>
                        <span className="text-[10px] opacity-70 block">{band.range}</span>
                        <span className="text-[10px] font-bold block mt-0.5">{band.multiplier}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}

        {/* Submit / Result */}
        {!submitted ? (
          <Button
            onClick={handleSubmit}
            disabled={!allSelected}
            className="w-full h-12 rounded-2xl text-base font-bold"
          >
            <Zap className="w-5 h-5 mr-2" />
            {t("submitPrediction", "Submit Prediction")}
          </Button>
        ) : (
          <div className="rounded-2xl bg-primary/5 border border-primary/20 p-4 space-y-3">
            <p className="text-sm font-bold text-foreground flex items-center gap-2">
              <Trophy className="w-4 h-4 text-primary" />
              {t("predictionSubmitted", "Prediction Submitted!")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("waitResult", "Results will be settled after the next content scan. Check back in ~24 hours.")}
            </p>
            <div className="space-y-2">
              {runs.map((run) => {
                const band = BANDS.find((b) => b.key === selectedBands[run.id]);
                return (
                  <div key={run.id} className="flex items-center justify-between bg-card rounded-xl p-3 border border-border">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{run.star?.display_name}</p>
                      <p className="text-xs text-muted-foreground">Score: {run.content_score}</p>
                    </div>
                    <Badge className={band?.color || ""}>
                      {band?.label} {band?.multiplier}
                    </Badge>
                  </div>
                );
              })}
            </div>
            {/* K-Cash Progress */}
            <div className="pt-2 border-t border-border mt-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">🎧 Spotify Premium</span>
                <span className="text-xs font-semibold text-foreground">1,250 / 9,000 K-Cashes</span>
              </div>
              <Progress value={(1250 / 9000) * 100} className="h-2" />
            </div>
          </div>
        )}

        {/* Daily Remaining */}
        <div className="text-center pb-4">
          <p className="text-xs text-muted-foreground">
            {t("dailyRemaining", "Daily free battles remaining:")} <span className="font-bold text-foreground">2 / 3</span>
          </p>
        </div>
      </div>
    </div>
  );
}
