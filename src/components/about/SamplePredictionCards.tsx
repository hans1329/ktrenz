import { useEffect, useState } from "react";
import { Flame, Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import SmartImage from "@/components/SmartImage";

interface ContentItem {
  title: string;
  thumbnail: string | null;
  source: string;
}

interface TrendPairData {
  pair_index: number;
  starA: { name: string; name_ko: string | null; image_url: string | null; items: ContentItem[] };
  starB: { name: string; name_ko: string | null; image_url: string | null; items: ContentItem[] };
}

const SamplePredictionCards = () => {
  const { language } = useLanguage();
  const [pairs, setPairs] = useState<TrendPairData[]>([]);
  const [loading, setLoading] = useState(true);

  const labels = {
    question: { en: "Which trend will dominate tomorrow?", ko: "내일 더 유행할 트렌드는?", ja: "明日のトレンドは？", zh: "明天哪个趋势更火？" },
    trendBy: { en: "'s Trend", ko: "의 트렌드", ja: "のトレンド", zh: "的趋势" },
    live: { en: "LIVE", ko: "LIVE", ja: "LIVE", zh: "LIVE" },
    predict: { en: "Predict Now →", ko: "예측하기 →", ja: "予測する →", zh: "预测 →" },
    noData: { en: "No active trend battles right now", ko: "현재 진행 중인 트렌드 배틀이 없습니다", ja: "現在進行中のトレンドバトルはありません", zh: "当前没有进行中的趋势对战" },
  };

  const t = (key: keyof typeof labels) =>
    labels[key][(language as "en" | "ko" | "ja" | "zh") || "en"] || labels[key].en;

  const getDisplayName = (star: { name: string; name_ko: string | null }) =>
    (language === "ko" && star.name_ko) || star.name;

  useEffect(() => {
    (async () => {
      try {
        const { data: battle } = await supabase
          .from("ktrenz_b2_battles")
          .select("batch_id, status")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!battle?.batch_id) { setLoading(false); return; }

        const { data: queue } = await (supabase as any)
          .from("ktrenz_b2_batch_queue")
          .select("pair_index, side, star_id")
          .eq("batch_id", battle.batch_id)
          .order("pair_index")
          .order("side");

        if (!queue || queue.length === 0) { setLoading(false); return; }

        const starIds = [...new Set(queue.map((q: any) => q.star_id))] as string[];

        const [starsRes, runsRes] = await Promise.all([
          supabase.from("ktrenz_stars").select("id, display_name, name_ko, image_url").in("id", starIds),
          supabase.from("ktrenz_b2_runs").select("id, star_id").in("star_id", starIds).order("created_at", { ascending: false }),
        ]);

        const starMap = new Map((starsRes.data || []).map((s: any) => [s.id, s]));
        const latestRunMap = new Map<string, string>();
        for (const run of (runsRes.data || [])) {
          if (!latestRunMap.has(run.star_id)) latestRunMap.set(run.star_id, run.id);
        }

        const runIds = [...latestRunMap.values()];
        const { data: items } = await supabase
          .from("ktrenz_b2_items")
          .select("run_id, title, thumbnail, source, engagement_score, has_thumbnail")
          .in("run_id", runIds)
          .eq("has_thumbnail", true)
          .neq("source", "naver_blog")
          .order("engagement_score", { ascending: false })
          .limit(200);

        const runToStar = new Map<string, string>();
        for (const [starId, runId] of latestRunMap) runToStar.set(runId, starId);

        const starItems = new Map<string, ContentItem[]>();
        for (const item of (items || [])) {
          const sid = runToStar.get(item.run_id);
          if (!sid) continue;
          const list = starItems.get(sid) || [];
          if (list.length < 3) {
            list.push({ title: item.title || "", thumbnail: item.thumbnail, source: item.source });
            starItems.set(sid, list);
          }
        }

        const pairMap = new Map<number, { A?: any; B?: any }>();
        for (const row of queue) {
          if (!pairMap.has(row.pair_index)) pairMap.set(row.pair_index, {});
          const entry = pairMap.get(row.pair_index)!;
          const star = starMap.get(row.star_id);
          const mapped = {
            name: star?.display_name || "Unknown",
            name_ko: star?.name_ko || null,
            image_url: star?.image_url || null,
            items: starItems.get(row.star_id) || [],
          };
          if (row.side === "A") entry.A = mapped;
          else entry.B = mapped;
        }

        const result: TrendPairData[] = [];
        for (const [idx, pair] of pairMap) {
          if (pair.A && pair.B) result.push({ pair_index: idx, starA: pair.A, starB: pair.B });
        }
        setPairs(result.slice(0, 2));
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="mt-8 flex justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (pairs.length === 0) {
    return (
      <div className="mt-8 text-center py-6 text-sm text-muted-foreground">
        {t("noData")}
      </div>
    );
  }

  const SideContent = ({ star }: { star: TrendPairData["starA"] }) => {
    const contentItems = (star.items || []).slice(0, 3);
    return (
      <div className="flex-1 min-w-0 space-y-2">
        {/* Artist label */}
        <div className="flex items-center gap-2 px-1">
          {star.image_url && (
            <SmartImage src={star.image_url} alt={star.name} className="w-7 h-7 rounded-full object-cover shrink-0 ring-2 ring-background" />
          )}
          <span className="text-sm font-bold text-foreground truncate">
            {getDisplayName(star)}{t("trendBy")}
          </span>
        </div>
        {/* Content cards */}
        <div className="space-y-2">
          {contentItems.length > 0 && (
            <>
              {/* Hero image */}
              {contentItems[0]?.thumbnail && (
                <div className="relative aspect-[16/10] rounded-xl overflow-hidden">
                  <SmartImage
                    src={contentItems[0].thumbnail}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <p className="absolute bottom-0 left-0 right-0 p-2.5 text-[11px] leading-snug font-medium text-white line-clamp-2">
                    {contentItems[0].title}
                  </p>
                </div>
              )}
              {/* Secondary items */}
              <div className="grid grid-cols-2 gap-1.5">
                {contentItems.slice(1).map((item, i) => (
                  <div key={i} className="relative aspect-square rounded-lg overflow-hidden">
                    {item.thumbnail ? (
                      <>
                        <SmartImage src={item.thumbnail} alt="" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                        <p className="absolute bottom-0 left-0 right-0 p-1.5 text-[9px] leading-tight font-medium text-white line-clamp-2">
                          {item.title}
                        </p>
                      </>
                    ) : (
                      <div className="w-full h-full bg-muted flex items-center justify-center">
                        <Flame className="w-4 h-4 text-muted-foreground/30" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
          {contentItems.length === 0 && (
            <div className="aspect-[16/10] rounded-xl bg-muted flex items-center justify-center">
              <Flame className="w-6 h-6 text-muted-foreground/30" />
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="mt-8 space-y-5">
      {pairs.map((pair) => (
        <div
          key={pair.pair_index}
          className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm"
        >
          {/* Header */}
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-destructive/15">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-destructive" />
                </span>
                <span className="text-[9px] font-bold text-destructive">{t("live")}</span>
              </div>
              <span className="text-xs text-muted-foreground font-medium">{t("question")}</span>
            </div>
          </div>

          {/* Content: Side A vs Side B */}
          <div className="px-3 pb-3 flex gap-3">
            <SideContent star={pair.starA} />

            {/* VS divider */}
            <div className="flex flex-col items-center justify-center shrink-0 gap-1">
              <div className="w-px flex-1 bg-border" />
              <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                <span className="text-xs font-black text-primary">VS</span>
              </div>
              <div className="w-px flex-1 bg-border" />
            </div>

            <SideContent star={pair.starB} />
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 border-t border-border bg-muted/30 flex items-center justify-center">
            <span className="text-xs text-primary font-semibold">{t("predict")}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default SamplePredictionCards;
