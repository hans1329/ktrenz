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
    category: "Music",
    grade: "Rising",
    prediction: "strong",
    status: "settled" as const,
    result: "win" as const,
    reward: 300,
    stake: 50,
    timeAgo: "2h",
  },
  {
    artist: "Jisoo",
    keyword: "우리 사랑 이대로",
    category: "Music",
    grade: "Hot",
    prediction: "explosive",
    status: "active" as const,
    result: null,
    reward: null,
    stake: 50,
    timeAgo: "12m",
  },
  {
    artist: "Kep1er",
    keyword: "KILLA",
    category: "Music",
    grade: "Spark",
    prediction: "mild",
    status: "settled" as const,
    result: "win" as const,
    reward: 100,
    stake: 50,
    timeAgo: "5h",
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
    reward: { en: "Reward", ko: "보상", ja: "報酬", zh: "奖励" },
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
            className="relative rounded-xl border border-border bg-card p-4 overflow-hidden"
          >
            {/* Status indicator */}
            {card.status === "settled" && card.result === "win" && (
              <div className="absolute top-3 right-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
            )}
            {card.status === "active" && (
              <div className="absolute top-3 right-3 flex items-center gap-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                </span>
              </div>
            )}

            {/* Artist & keyword */}
            <p className="text-[10px] text-muted-foreground font-medium">
              {card.artist}
            </p>
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
              <span className="text-[10px] text-muted-foreground/60">{card.category}</span>
            </div>

            {/* Prediction */}
            <div className="mt-3 flex items-center justify-between">
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
        ))}
      </div>
    </div>
  );
};

export default SamplePredictionCards;
