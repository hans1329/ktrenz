import { useState } from "react";
import { Ticket, Crown, Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { LEVEL_TIERS, getLevelInfo } from "@/lib/levelUtils";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

interface TicketInfoPopupProps {
  open: boolean;
  onClose: () => void;
  remaining: number;
  total: number;
  totalPoints?: number;
}

const TicketInfoPopup = ({ open, onClose, remaining, total, totalPoints }: TicketInfoPopupProps) => {
  const { language } = useLanguage();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const lang = (language === "ko" || language === "ja" || language === "zh") ? language : "en";
  const title = lang === "ko" ? "예측 티켓" : lang === "ja" ? "予測チケット" : lang === "zh" ? "预测票" : "Prediction Tickets";
  const desc = lang === "ko"
    ? "매일 15:00(GMT)에 새로 지급되며, 미사용 티켓은 소멸됩니다."
    : lang === "ja"
    ? "毎日15:00(GMT)に新しく支給され、未使用チケットは消滅します。"
    : lang === "zh"
    ? "每天15:00(GMT)重新发放，未使用的票将失效。"
    : "Tickets reset daily at 15:00 GMT. Unused tickets do not carry over.";
  const tierLabel = lang === "ko" ? "등급" : lang === "ja" ? "ランク" : lang === "zh" ? "等级" : "Tier";
  const dailyLabel = lang === "ko" ? "일일 티켓" : lang === "ja" ? "日次チケット" : lang === "zh" ? "每日票数" : "Daily Tickets";
  const closeText = lang === "ko" ? "닫기" : lang === "ja" ? "閉じる" : lang === "zh" ? "关闭" : "Close";

  const proTitle = lang === "ko" ? "Pro 구독" : lang === "ja" ? "Proサブスク" : lang === "zh" ? "Pro订阅" : "Pro Subscription";
  const proDesc = lang === "ko"
    ? "월 $4.99로 매일 10개 예측 티켓 지급"
    : lang === "ja"
    ? "月額$4.99で毎日10枚の予測チケット"
    : lang === "zh"
    ? "每月$4.99，每天10张预测票"
    : "Get 10 daily prediction tickets for $4.99/month";
  const subscribeText = lang === "ko" ? "구독하기" : lang === "ja" ? "登録する" : lang === "zh" ? "订阅" : "Subscribe";

  const lvl = getLevelInfo(totalPoints ?? 0);

  const handleSubscribe = async () => {
    if (!user || loading) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ktrenz-ticket-checkout");
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
      } else {
        throw new Error("No checkout URL");
      }
    } catch (e: any) {
      toast({ title: e.message || "Failed to start checkout", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[320px] rounded-2xl p-5 gap-4 [&>button]:hidden">
        <DialogTitle className="sr-only">{title}</DialogTitle>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Ticket className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-bold text-foreground text-sm">{title}</p>
            <p className="text-xs text-muted-foreground">{remaining} / {total}</p>
          </div>
        </div>

        {/* Tier table */}
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="grid grid-cols-3 text-[11px] font-semibold text-muted-foreground bg-muted/50 px-3 py-1.5">
            <span>{tierLabel}</span>
            <span className="text-center">Level</span>
            <span className="text-right">{dailyLabel}</span>
          </div>
          {LEVEL_TIERS.map((t, i) => {
            const isCurrentTier = lvl.tier === t.id;
            return (
              <div key={i} className={cn(
                "grid grid-cols-3 px-3 py-2 text-xs",
                isCurrentTier ? "bg-primary/5 font-bold text-primary" : "text-foreground"
              )}>
                <span>{t.name[lang]}</span>
                <span className="text-center text-muted-foreground">{t.levelRange}</span>
                <span className="text-right flex items-center justify-end gap-0.5">{t.tickets}<Ticket className="w-3 h-3 inline" /></span>
              </div>
            );
          })}
        </div>

        {/* XP Progress */}
        {totalPoints !== undefined && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-foreground">
                Lv.{lvl.level} · {lvl.tierName[lang]}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {lvl.nextTierPoints !== null
                  ? `${lang === "ko" ? "다음 등급까지" : "Next tier"} ${(lvl.nextTierPoints - lvl.totalXp).toLocaleString()} XP`
                  : (lang === "ko" ? "최고 등급" : "Max tier")}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold text-primary shrink-0">{lvl.level}</span>
              <Progress value={lvl.levelProgress} className="h-1.5 flex-1" />
              <span className="text-[10px] font-semibold text-muted-foreground shrink-0">{lvl.level + 1}</span>
            </div>
            <p className="text-[10px] text-muted-foreground text-right">
              {lvl.currentLevelXp} / {lvl.xpForNextLevel} XP
            </p>
            <p className="text-[10px] text-muted-foreground">
              {lang === "ko"
                ? "예측·배틀 참여로 경험치를 얻고, 등급이 오르면 티켓이 늘어납니다."
                : lang === "ja"
                ? "予測やバトルに参加してXPを獲得し、ランクが上がるとチケットが増えます。"
                : lang === "zh"
                ? "参与预测和对战获取经验值，升级后可获得更多票。"
                : "Earn XP through predictions & battles. Higher tiers unlock more tickets."}
            </p>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground leading-relaxed">{desc}</p>

        {/* Pro Subscription Upsell */}
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Crown className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold text-foreground">{proTitle}</span>
            <span className="ml-auto text-xs font-semibold text-primary">$4.99/mo</span>
          </div>
          <p className="text-[11px] text-muted-foreground">{proDesc}</p>
          <button
            onClick={handleSubscribe}
            disabled={loading || !user}
            className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />}
            {subscribeText}
          </button>
        </div>

        <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-muted text-sm font-medium text-foreground hover:bg-muted/80 transition-colors">
          {closeText}
        </button>
      </DialogContent>
    </Dialog>
  );
};

export default TicketInfoPopup;
