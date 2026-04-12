import { useEffect, useState } from "react";
import { TrendingUp, Loader2, Flame } from "lucide-react";
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
    title: { en: "Today's Trend Battles", ko: "오늘의 트렌드 배틀", ja: "本日のトレンドバトル", zh: "今日趋势对战" },
    question: { en: "Which trend will dominate tomorrow?", ko: "내일 더 유행할 트렌드는?", ja: "明日のトレンドは？", zh: "明天哪个趋势更火？" },
    trendBy: { en: "'s Trend", ko: "의 트렌드", ja: "のトレンド", zh: "的趋势" },
    vs: { en: "VS", ko: "VS", ja: "VS", zh: "VS" },
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

        // Fetch stars and their latest items in parallel
        const [starsRes, runsRes] = await Promise.all([
          supabase.from("ktrenz_stars").select("id, display_name, name_ko, image_url").in("id", starIds),
          supabase.from("ktrenz_b2_runs").select("id, star_id").in("star_id", starIds).order("created_at", { ascending: false }),
        ]);

        const starMap = new Map((starsRes.data || []).map((s: any) => [s.id, s]));

        // Get latest run per star
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

        // Group items by star_id via run
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

        // Build pairs
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
        setPairs(result.slice(0, 3));
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

  return (
    <div className="mt-8 space-y-4">
      {pairs.map((pair) => (
        <div
          key={pair.pair_index}
          className="relative rounded-2xl border border-border bg-card overflow-hidden"
        >
          {/* Header: Question */}
          <div className="px-4 pt-4 pb-3 border-b border-border">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/15">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
                </span>
                <span className="text-[9px] font-bold text-red-400">{t("live")}</span>
              </div>
              <span className="text-xs text-muted-foreground">{t("question")}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {pair.starA.image_url && (
                  <SmartImage src={pair.starA.image_url} alt={pair.starA.name} className="w-6 h-6 rounded-full object-cover shrink-0" />
                )}
                <span className="text-sm font-bold text-foreground truncate">
                  {getDisplayName(pair.starA)}{t("trendBy")}
                </span>
              </div>
              <div className="shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Flame className="w-3.5 h-3.5 text-primary" />
              </div>
              <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
                <span className="text-sm font-bold text-foreground truncate text-right">
                  {getDisplayName(pair.starB)}{t("trendBy")}
                </span>
                {pair.starB.image_url && (
                  <SmartImage src={pair.starB.image_url} alt={pair.starB.name} className="w-6 h-6 rounded-full object-cover shrink-0" />
                )}
              </div>
            </div>
          </div>

          {/* Content grid: Side A vs Side B */}
          <div className="flex">
            {/* Side A */}
            <div className="flex-1 p-2.5 space-y-1.5">
              {pair.starA.items.slice(0, 3).map((item, i) => (
                <div key={i} className="flex gap-2 items-start">
                  {item.thumbnail && (
                    <SmartImage
                      src={item.thumbnail}
                      alt=""
                      className="w-12 h-9 rounded object-cover shrink-0"
                    />
                  )}
                  <p className="text-[11px] leading-tight text-muted-foreground line-clamp-2 flex-1">
                    {item.title}
                  </p>
                </div>
              ))}
              {pair.starA.items.length === 0 && (
                <div className="h-[72px] flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-muted-foreground/40" />
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="w-px bg-border" />

            {/* Side B */}
            <div className="flex-1 p-2.5 space-y-1.5">
              {pair.starB.items.slice(0, 3).map((item, i) => (
                <div key={i} className="flex gap-2 items-start">
                  {item.thumbnail && (
                    <SmartImage
                      src={item.thumbnail}
                      alt=""
                      className="w-12 h-9 rounded object-cover shrink-0"
                    />
                  )}
                  <p className="text-[11px] leading-tight text-muted-foreground line-clamp-2 flex-1">
                    {item.title}
                  </p>
                </div>
              ))}
              {pair.starB.items.length === 0 && (
                <div className="h-[72px] flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-muted-foreground/40" />
                </div>
              )}
            </div>
          </div>

          {/* Footer CTA */}
          <div className="px-4 py-2.5 border-t border-border flex items-center justify-center">
            <span className="text-xs text-primary font-medium">{t("predict")}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default SamplePredictionCards;
