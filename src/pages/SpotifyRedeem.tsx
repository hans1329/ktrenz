import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Gift, CheckCircle, AlertCircle, Music } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import SEO from "@/components/SEO";

const SPOTIFY_GOAL = 9000;

const SPOTIFY_SVG = (
  <svg viewBox="0 0 24 24" fill="hsl(142, 71%, 45%)"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
);

const LABELS: Record<string, Record<string, string>> = {
  pageTitle: {
    en: "Redeem Spotify Premium",
    ko: "Spotify Premium 교환",
    ja: "Spotify Premium 交換",
    zh: "兑换 Spotify Premium",
  },
  subtitle: {
    en: "Exchange your K-Cash for a 1-month Spotify Premium subscription code",
    ko: "K-Cash를 사용해 Spotify Premium 1개월 구독 코드를 받으세요",
    ja: "K-CashでSpotify Premium 1ヶ月コードに交換",
    zh: "使用K-Cash兑换Spotify Premium 1个月订阅码",
  },
  yourBalance: {
    en: "Your Balance",
    ko: "보유 잔액",
    ja: "残高",
    zh: "余额",
  },
  required: {
    en: "Required",
    ko: "필요 캐쉬",
    ja: "必要額",
    zh: "所需",
  },
  remaining: {
    en: "remaining to goal",
    ko: "목표까지 남은 캐쉬",
    ja: "目標まであと",
    zh: "距目标还差",
  },
  redeemBtn: {
    en: "Redeem Now",
    ko: "교환하기",
    ja: "交換する",
    zh: "立即兑换",
  },
  notEnough: {
    en: "Not enough K-Cash",
    ko: "캐쉬가 부족합니다",
    ja: "K-Cashが不足しています",
    zh: "K-Cash不足",
  },
  howTitle: {
    en: "How to earn K-Cash",
    ko: "K-Cash 획득 방법",
    ja: "K-Cash獲得方法",
    zh: "如何获取K-Cash",
  },
  how1: {
    en: "Predict trend battles daily",
    ko: "매일 트렌드 배틀 예측에 참여하세요",
    ja: "毎日トレンドバトルを予測する",
    zh: "每日参与趋势预测",
  },
  how2: {
    en: "Correct predictions earn 100~1,000 K-Cash",
    ko: "예측 성공 시 100~1,000 캐쉬를 받아요",
    ja: "予測成功で100〜1,000 K-Cash獲得",
    zh: "预测正确可获得100~1,000 K-Cash",
  },
  how3: {
    en: "Complete daily missions for bonus rewards",
    ko: "데일리 미션 완료로 보너스를 받으세요",
    ja: "デイリーミッションでボーナス獲得",
    zh: "完成每日任务获取额外奖励",
  },
  note: {
    en: "After redemption, a subscription code will be sent to your registered email within 24 hours.",
    ko: "교환 후 24시간 이내에 가입된 이메일로 구독 코드가 발송됩니다.",
    ja: "交換後、24時間以内に登録メールに購読コードが送信されます。",
    zh: "兑换后，24小时内将向注册邮箱发送订阅码。",
  },
  loginRequired: {
    en: "Please log in to redeem",
    ko: "교환하려면 로그인이 필요합니다",
    ja: "交換するにはログインが必要です",
    zh: "请登录后兑换",
  },
  comingSoon: {
    en: "Coming Soon",
    ko: "출시 예정",
    ja: "近日公開",
    zh: "即将推出",
  },
  comingSoonDesc: {
    en: "The redemption feature is currently being prepared. Keep earning K-Cash!",
    ko: "교환 기능을 준비 중입니다. K-Cash를 계속 모아주세요!",
    ja: "交換機能は現在準備中です。K-Cashを貯め続けましょう！",
    zh: "兑换功能正在准备中，请继续赚取K-Cash！",
  },
  backToBattle: {
    en: "Back to Battle",
    ko: "배틀로 돌아가기",
    ja: "バトルに戻る",
    zh: "返回对战",
  },
};

const SpotifyRedeem = () => {
  const navigate = useNavigate();
  const { user, kPoints } = useAuth();
  const { language } = useLanguage();
  const l = (key: string) => LABELS[key]?.[language] || LABELS[key]?.en || key;

  const progress = Math.min((kPoints / SPOTIFY_GOAL) * 100, 100);
  const canRedeem = kPoints >= SPOTIFY_GOAL;
  const deficit = Math.max(SPOTIFY_GOAL - kPoints, 0);

  return (
    <div className="min-h-screen bg-background">
      <SEO title={l("pageTitle")} description={l("subtitle")} />

      {/* Header */}
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="flex items-center gap-3 px-4 py-3 max-w-lg mx-auto">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <h1 className="font-bold text-foreground text-base">{l("pageTitle")}</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Hero Card */}
        <div className="rounded-2xl border border-border/50 bg-card p-6 space-y-5">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 shrink-0">{SPOTIFY_SVG}</div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Spotify Premium</h2>
              <p className="text-sm text-muted-foreground">1 Month Subscription</p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">{l("subtitle")}</p>

          {/* Progress */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{l("yourBalance")}</span>
              <span className="font-bold text-foreground">💎 {kPoints.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{l("required")}</span>
              <span className="font-semibold text-foreground">{SPOTIFY_GOAL.toLocaleString()} K-Cash</span>
            </div>

            <div className="h-3 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${Math.max(progress, 2)}%`,
                  backgroundColor: canRedeem ? "hsl(142, 71%, 45%)" : "hsl(var(--primary))",
                }}
              />
            </div>

            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{progress.toFixed(0)}%</span>
              {!canRedeem && (
                <span className="flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {deficit.toLocaleString()} {l("remaining")}
                </span>
              )}
              {canRedeem && (
                <span className="flex items-center gap-1 text-green-500">
                  <CheckCircle className="w-3 h-3" />
                  Ready!
                </span>
              )}
            </div>
          </div>

          {/* CTA - Coming Soon state */}
          <div className="space-y-2">
            <Button
              disabled
              className={cn(
                "w-full h-12 rounded-xl text-sm font-bold gap-2",
                "bg-[hsl(142,71%,45%)] hover:bg-[hsl(142,71%,40%)] text-white"
              )}
            >
              <Gift className="w-4 h-4" />
              {l("comingSoon")}
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">{l("comingSoonDesc")}</p>
          </div>
        </div>

        {/* How to earn */}
        <div className="rounded-2xl border border-border/50 bg-card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Music className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-foreground text-sm">{l("howTitle")}</h3>
          </div>
          <div className="space-y-2.5">
            {["how1", "how2", "how3"].map((key) => (
              <div key={key} className="flex items-start gap-2.5 text-xs text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1" />
                <span>{l(key)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Note */}
        <div className="rounded-xl bg-muted/50 p-4">
          <p className="text-[11px] text-muted-foreground leading-relaxed">{l("note")}</p>
        </div>

        {/* Back button */}
        <Button
          variant="outline"
          className="w-full rounded-xl"
          onClick={() => navigate("/")}
        >
          {l("backToBattle")}
        </Button>
      </div>
    </div>
  );
};

export default SpotifyRedeem;
