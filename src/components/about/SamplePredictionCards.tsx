import { TrendingUp, Clock, CheckCircle2, Flame, Sparkles } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

const gradeColors: Record<string, string> = {
  Spark: "bg-zinc-500/20 text-zinc-300",
  Rising: "bg-blue-500/20 text-blue-400",
  Hot: "bg-orange-500/20 text-orange-400",
  Viral: "bg-pink-500/20 text-pink-400",
  Mega: "bg-red-500/20 text-red-400",
};

const sampleCards = [
  {
    artist: "Dahyun",
    keyword: "CHESS",
    grade: "Rising",
    prediction: "strong",
    status: "settled" as const,
    result: "win" as const,
    reward: 300,
    stake: 50,
    timeAgo: "2h",
    image: "https://jguylowswwgjvotdcsfj.supabase.co/storage/v1/object/public/wiki-images/09209991-f91c-4e6b-963c-4c8bd1813755-dahyun.webp",
  },
  {
    artist: "Jisoo",
    keyword: "우리 사랑 이대로",
    grade: "Hot",
    prediction: "explosive",
    status: "active" as const,
    result: null,
    reward: null,
    stake: 50,
    timeAgo: "12m",
    image: "https://jguylowswwgjvotdcsfj.supabase.co/storage/v1/object/public/wiki-images/bb9b51d5-7550-4fec-b3d6-500b5e8c13c2/1762432257775.webp",
  },
  {
    artist: "Kep1er",
    keyword: "KILLA",
    grade: "Spark",
    prediction: "mild",
    status: "settled" as const,
    result: "win" as const,
    reward: 100,
    stake: 50,
    timeAgo: "5h",
    image: "https://jguylowswwgjvotdcsfj.supabase.co/storage/v1/object/public/wiki-images/v3-artists/b6085cad-73c7-4407-ba1e-a02ca908817e.webp?t=1772357088783",
  },
];

const SamplePredictionCards = () => {
  const { language } = useLanguage();

  const labels = {
    title: {
      en: "Live Prediction Cards",
      ko: "실제 예측 카드 예시",
      ja: "ライブ予測カード",
      zh: "实时预测卡片",
    },
    mild: { en: "Mild Rise", ko: "소폭 상승", ja: "小幅上昇", zh: "小幅上涨" },
    strong: { en: "Strong Rise", ko: "강한 상승", ja: "強い上昇", zh: "强劲上涨" },
    explosive: { en: "Explosive Rise", ko: "폭발적 상승", ja: "爆発的上昇", zh: "爆发式上涨" },
    win: { en: "Won!", ko: "적중!", ja: "的中!", zh: "赢了!" },
    active: { en: "In Progress", ko: "진행 중", ja: "進行中", zh: "进行中" },
    bet: { en: "Bet", ko: "예측", ja: "予測", zh: "预测" },
  };

  const t = (key: keyof typeof labels) =>
    labels[key][language as keyof (typeof labels)[typeof key]] || labels[key].en;

  const predictionLabel = (p: string) =>
    labels[p as keyof typeof labels]?.[language as "en" | "ko" | "ja" | "zh"] ||
    labels[p as keyof typeof labels]?.en || p;

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-4 h-4 text-primary" />
        <span className="text-xs font-bold text-primary uppercase tracking-widest">
          {t("title")}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {sampleCards.map((card, i) => (
          <div
            key={i}
            className="relative rounded-xl border border-border bg-card overflow-hidden"
          >
            {/* Artist image — tall, no dimming */}
            <div className="relative h-44 overflow-hidden">
              <img
                src={card.image}
                alt={card.artist}
                className="w-full h-full object-cover object-top"
                loading="lazy"
              />

              {/* Status badge on image */}
              {card.status === "settled" && card.result === "win" && (
                <div className="absolute top-2.5 right-2.5 flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 backdrop-blur-sm">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span className="text-[9px] font-bold text-emerald-400">{t("win")}</span>
                </div>
              )}
              {card.status === "active" && (
                <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/20 backdrop-blur-sm">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
                  </span>
                  <span className="text-[9px] font-bold text-primary">{t("active")}</span>
                </div>
              )}
            </div>

            {/* Card body */}
            <div className="px-3 pb-3 pt-2.5">
              {/* Artist & keyword */}
              <p className="text-[10px] text-muted-foreground font-medium">{card.artist}</p>
              <h4 className="text-sm font-bold text-foreground mt-0.5 truncate">
                {card.keyword}
              </h4>

              {/* Grade badge */}
              <div className="flex items-center gap-2 mt-2">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${gradeColors[card.grade]}`}
                >
                  <Flame className="w-3 h-3" />
                  {card.grade}
                </span>
              </div>

              {/* Prediction */}
              <div className="mt-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-semibold text-foreground">
                    {predictionLabel(card.prediction)}
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {card.timeAgo}
                </span>
              </div>

              {/* Result / reward */}
              <div className="mt-2 pt-2 border-t border-border flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">
                  {t("bet")}: {card.stake} 캐쉬
                </span>
                {card.status === "settled" && card.result === "win" ? (
                  <span className="text-xs font-bold text-emerald-400">
                    +{card.reward} 캐쉬 ✓
                  </span>
                ) : (
                  <span className="text-[10px] font-medium text-primary">
                    {t("active")}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SamplePredictionCards;
