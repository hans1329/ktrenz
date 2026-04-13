import { useLanguage } from "@/contexts/LanguageContext";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Gift, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const LABELS: Record<string, Record<string, string>> = {
  title: { en: "Welcome! 🎉", ko: "환영합니다! 🎉", ja: "ようこそ！🎉", zh: "欢迎！🎉" },
  subtitle: { en: "You've received a signup bonus!", ko: "가입 축하 보너스를 받았어요!", ja: "登録ボーナスを獲得しました！", zh: "您获得了注册奖励！" },
  desc: { en: "Use your points to predict trends\nand earn Spotify Premium!", ko: "포인트로 트렌드를 예측하고\nSpotify Premium을 받으세요!", ja: "ポイントでトレンドを予測して\nSpotify Premiumをゲット！", zh: "用积分预测趋势\n赢取Spotify Premium！" },
  cta: { en: "Start Exploring", ko: "시작하기", ja: "始める", zh: "开始" },
};

interface WelcomeBonusDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const WelcomeBonusDrawer = ({ open, onOpenChange }: WelcomeBonusDrawerProps) => {
  const { language } = useLanguage();
  const { welcomeBonusAmount } = useAuth();
  const l = (key: string) => LABELS[key]?.[language] || LABELS[key]?.en || key;

  const amountLabel = `${(welcomeBonusAmount || 1000).toLocaleString()} K-Cashes`;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-lg rounded-t-2xl">
        <div className="flex flex-col items-center text-center px-6 pt-6 pb-8">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4"
            style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(280 60% 55%))" }}
          >
            <Gift className="w-10 h-10 text-white" />
          </div>

          <h2 className="text-2xl font-black text-foreground mb-1">{l("title")}</h2>
          <p className="text-sm text-muted-foreground mb-5">{l("subtitle")}</p>

          <div className="flex items-center gap-2 px-6 py-3 rounded-2xl mb-4"
            style={{ background: "linear-gradient(135deg, hsl(var(--primary) / 0.15), hsl(280 60% 55% / 0.1))" }}
          >
            <Sparkles className="w-5 h-5 text-primary" />
            <span className="text-2xl font-black text-primary">{amountLabel}</span>
          </div>

          <p className="text-sm text-muted-foreground whitespace-pre-line mb-6">{l("desc")}</p>

          <Button onClick={() => onOpenChange(false)} className="w-full rounded-xl h-12 text-base font-bold">
            {l("cta")}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default WelcomeBonusDrawer;
