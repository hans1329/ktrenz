import { createPortal } from "react-dom";
import { Ticket } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

const TIER_TICKETS = [
  { tier: { en: "Beginner", ko: "초보", ja: "初心者", zh: "新手" }, level: "Lv.1–5", tickets: 3 },
  { tier: { en: "Explorer", ko: "탐색가", ja: "探索者", zh: "探索者" }, level: "Lv.6–15", tickets: 5 },
  { tier: { en: "Analyst", ko: "분석가", ja: "分析家", zh: "分析师" }, level: "Lv.16–30", tickets: 7 },
  { tier: { en: "Expert", ko: "전문가", ja: "専門家", zh: "专家" }, level: "Lv.31+", tickets: 10 },
];

interface TicketInfoPopupProps {
  open: boolean;
  onClose: () => void;
  remaining: number;
  total: number;
}

const TicketInfoPopup = ({ open, onClose, remaining, total }: TicketInfoPopupProps) => {
  const { language } = useLanguage();
  if (!open) return null;

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

  return createPortal(
    <>
      <div className="fixed inset-0 z-[100] bg-black/40" onClick={onClose} />
      <div className="fixed z-[101] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(320px,90vw)] bg-card rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Ticket className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-bold text-foreground text-sm">{title}</p>
            <p className="text-xs text-muted-foreground">{remaining} / {total}</p>
          </div>
        </div>

        <div className="rounded-xl border border-border overflow-hidden">
          <div className="grid grid-cols-3 text-[11px] font-semibold text-muted-foreground bg-muted/50 px-3 py-1.5">
            <span>{tierLabel}</span>
            <span className="text-center">Level</span>
            <span className="text-right">{dailyLabel}</span>
          </div>
          {TIER_TICKETS.map((t, i) => (
            <div key={i} className={cn(
              "grid grid-cols-3 px-3 py-2 text-xs",
              t.tickets === total ? "bg-primary/5 font-bold text-primary" : "text-foreground"
            )}>
              <span>{t.tier[lang]}</span>
              <span className="text-center text-muted-foreground">{t.level}</span>
              <span className="text-right">{t.tickets}🎫</span>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed">{desc}</p>

        <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-muted text-sm font-medium text-foreground hover:bg-muted/80 transition-colors">
          {closeText}
        </button>
      </div>
    </>,
    document.body
  );
};

export default TicketInfoPopup;
