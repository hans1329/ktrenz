import { useEffect, useState } from "react";
import { Swords, Clock, Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import SmartImage from "@/components/SmartImage";

interface BattlePairData {
  pair_index: number;
  starA: { name: string; name_ko: string | null; image_url: string | null };
  starB: { name: string; name_ko: string | null; image_url: string | null };
}

const SamplePredictionCards = () => {
  const { language } = useLanguage();
  const [pairs, setPairs] = useState<BattlePairData[]>([]);
  const [loading, setLoading] = useState(true);

  const labels = {
    title: { en: "Today's Live Battles", ko: "오늘의 라이브 배틀", ja: "本日のライブバトル", zh: "今日实时对战" },
    vs: { en: "VS", ko: "VS", ja: "VS", zh: "VS" },
    live: { en: "LIVE", ko: "LIVE", ja: "LIVE", zh: "LIVE" },
    joinNow: { en: "Join the Battle →", ko: "배틀 참여하기 →", ja: "バトルに参加 →", zh: "参加对战 →" },
    noData: { en: "No active battles right now", ko: "현재 진행 중인 배틀이 없습니다", ja: "現在進行中のバトルはありません", zh: "当前没有进行中的对战" },
  };

  const t = (key: keyof typeof labels) =>
    labels[key][(language as "en" | "ko" | "ja" | "zh") || "en"] || labels[key].en;

  useEffect(() => {
    (async () => {
      try {
        // Get latest battle
        const { data: battle } = await supabase
          .from("ktrenz_b2_battles")
          .select("batch_id, status")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!battle?.batch_id) { setLoading(false); return; }

        // Get batch queue
        const { data: queue } = await (supabase as any)
          .from("ktrenz_b2_batch_queue")
          .select("pair_index, side, star_id")
          .eq("batch_id", battle.batch_id)
          .order("pair_index")
          .order("side");

        if (!queue || queue.length === 0) { setLoading(false); return; }

        // Fetch star info separately
        const starIds = [...new Set(queue.map((q: any) => q.star_id))];
        const { data: stars } = await supabase
          .from("ktrenz_stars")
          .select("id, display_name, name_ko, image_url")
          .in("id", starIds);
        const starMap = new Map((stars || []).map((s: any) => [s.id, s]));

        // Group by pair_index
        const pairMap = new Map<number, { A?: any; B?: any }>();
        for (const row of queue) {
          if (!pairMap.has(row.pair_index)) pairMap.set(row.pair_index, {});
          const entry = pairMap.get(row.pair_index)!;
          const star = starMap.get(row.star_id);
          const mapped = {
            name: star?.display_name || "Unknown",
            name_ko: star?.name_ko || null,
            image_url: star?.image_url || null,
          };
          if (row.side === "A") entry.A = mapped;
          else entry.B = mapped;
        }

        const result: BattlePairData[] = [];
        for (const [idx, pair] of pairMap) {
          if (pair.A && pair.B) {
            result.push({ pair_index: idx, starA: pair.A, starB: pair.B });
          }
        }
        setPairs(result.slice(0, 4));
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
    <div className="mt-8">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {pairs.map((pair) => (
          <div
            key={pair.pair_index}
            className="relative rounded-xl border border-border bg-card overflow-hidden"
          >
            {/* LIVE badge */}
            <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/20 backdrop-blur-sm">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
              </span>
              <span className="text-[9px] font-bold text-red-400">{t("live")}</span>
            </div>

            {/* VS images */}
            <div className="relative h-36 flex">
              {/* Star A */}
              <div className="w-1/2 h-full overflow-hidden">
                {pair.starA.image_url ? (
                  <SmartImage
                    src={pair.starA.image_url}
                    alt={pair.starA.name}
                    className="w-full h-full object-cover object-top"
                  />
                ) : (
                  <div className="w-full h-full bg-muted flex items-center justify-center text-2xl font-bold text-muted-foreground">
                    {pair.starA.name.charAt(0)}
                  </div>
                )}
              </div>
              {/* Star B */}
              <div className="w-1/2 h-full overflow-hidden border-l border-border">
                {pair.starB.image_url ? (
                  <SmartImage
                    src={pair.starB.image_url}
                    alt={pair.starB.name}
                    className="w-full h-full object-cover object-top"
                  />
                ) : (
                  <div className="w-full h-full bg-muted flex items-center justify-center text-2xl font-bold text-muted-foreground">
                    {pair.starB.name.charAt(0)}
                  </div>
                )}
              </div>
              {/* VS overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-8 h-8 rounded-full bg-background/90 backdrop-blur-sm border border-border flex items-center justify-center shadow-lg">
                  <Swords className="w-3.5 h-3.5 text-primary" />
                </div>
              </div>
            </div>

            {/* Card body */}
            <div className="px-3 pb-3 pt-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground truncate max-w-[45%]">
                  {(language === "ko" && pair.starA.name_ko) || pair.starA.name}
                </span>
                <span className="text-[10px] text-muted-foreground font-medium">vs</span>
                <span className="text-xs font-bold text-foreground truncate max-w-[45%] text-right">
                  {(language === "ko" && pair.starB.name_ko) || pair.starB.name}
                </span>
              </div>

              <div className="mt-2 pt-2 border-t border-border flex items-center justify-center gap-1.5">
                <Clock className="w-3 h-3 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">
                  {t("joinNow")}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SamplePredictionCards;
