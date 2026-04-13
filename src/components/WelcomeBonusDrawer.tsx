import { useLanguage } from "@/contexts/LanguageContext";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Gift, Sparkles, Music } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const LABELS: Record<string, Record<string, string>> = {
  title: {
    en: "Welcome Bonus! 🎉",
    ko: "가입 축하 보너스! 🎉",
    ja: "ウェルカムボーナス！🎉",
    zh: "注册奖励！🎉",
  },
  subtitle: {
    en: "You've received a signup reward",
    ko: "가입 축하 보상이 지급되었어요",
    ja: "登録ボーナスが付与されました",
    zh: "您已获得注册奖励",
  },
  goalTitle: {
    en: "🎯 Your Goal",
    ko: "🎯 목표",
    ja: "🎯 目標",
    zh: "🎯 目标",
  },
  goalDesc: {
    en: "Collect 9,000 K-Cashes to redeem\na Spotify Premium subscription!",
    ko: "9,000 캐쉬를 모으면\nSpotify Premium 구독권으로 교환!",
    ja: "9,000 K-Cashesを貯めると\nSpotify Premiumに交換可能！",
    zh: "累计9,000 K-Cashes\n即可兑换Spotify Premium订阅！",
  },
  howTitle: {
    en: "How to earn",
    ko: "획득 방법",
    ja: "獲得方法",
    zh: "获取方式",
  },
  how1: {
    en: "Predict trend battles daily",
    ko: "매일 트렌드 배틀 예측 참여",
    ja: "毎日トレンドバトルを予測",
    zh: "每日参与趋势预测",
  },
  how2: {
    en: "Correct predictions earn 100~1,000",
    ko: "예측 성공 시 100~1,000 캐쉬 획득",
    ja: "予測成功で100〜1,000獲得",
    zh: "预测正确可获100~1,000",
  },
  cta: {
    en: "Start Predicting",
    ko: "예측 시작하기",
    ja: "予測を始める",
    zh: "开始预测",
  },
};

interface WelcomeBonusDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const WelcomeBonusDrawer = ({ open, onOpenChange }: WelcomeBonusDrawerProps) => {
  const { language } = useLanguage();
  const { welcomeBonusAmount } = useAuth();
  const l = (key: string) => LABELS[key]?.[language] || LABELS[key]?.en || key;

  const amount = welcomeBonusAmount || 1000;
  const goal = 9000;
  const progressPercent = Math.min((amount / goal) * 100, 100);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[340px] rounded-2xl p-0 border-border/50 gap-0 [&>button]:top-3 [&>button]:right-3">
        <DialogTitle className="sr-only">{l("title")}</DialogTitle>

        {/* Header */}
        <div className="flex flex-col items-center text-center px-6 pt-7 pb-0">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Gift className="w-7 h-7 text-primary" />
          </div>

          <h2 className="text-lg font-bold text-foreground mb-1">{l("title")}</h2>
          <p className="text-xs text-muted-foreground">{l("subtitle")}</p>
        </div>

        {/* Amount Badge */}
        <div className="px-6 pt-4">
          <div className="flex items-center justify-center gap-2 py-3 rounded-xl bg-primary/5 border border-primary/10">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-xl font-black text-primary tracking-tight">
              +{amount.toLocaleString()} K-Cashes
            </span>
          </div>
        </div>

        {/* Goal Section */}
        <div className="px-6 pt-4">
          <div className="rounded-xl border border-border/50 bg-muted/30 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Music className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-semibold text-foreground">{l("goalTitle")}</span>
            </div>

            <p className="text-xs text-muted-foreground whitespace-pre-line leading-relaxed">
              {l("goalDesc")}
            </p>

            {/* Progress bar */}
            <div className="space-y-1.5">
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>{amount.toLocaleString()}</span>
                <span>{goal.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* How to earn */}
        <div className="px-6 pt-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            {l("howTitle")}
          </p>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-1 h-1 rounded-full bg-primary shrink-0" />
              {l("how1")}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-1 h-1 rounded-full bg-primary shrink-0" />
              {l("how2")}
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="px-6 pt-4 pb-6">
          <Button
            onClick={() => onOpenChange(false)}
            className="w-full rounded-xl h-11 text-sm font-semibold"
          >
            {l("cta")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WelcomeBonusDrawer;
