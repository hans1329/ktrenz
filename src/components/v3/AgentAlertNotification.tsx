import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { X, MessageCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { AgentAlert } from "@/hooks/useAgentAlerts";

export default function AgentAlertNotification({
  alert,
  onDismiss,
}: {
  alert: AgentAlert | null;
  onDismiss: () => void;
}) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (alert) {
      // Small delay so drawer animates in
      const timer = setTimeout(() => setOpen(true), 300);
      return () => clearTimeout(timer);
    } else {
      setOpen(false);
    }
  }, [alert]);

  if (!alert) return null;

  const handleClose = () => {
    setOpen(false);
    setTimeout(onDismiss, 300);
  };

  const handleGoToChat = () => {
    setOpen(false);
    // Store a seed so the agent auto-sends an analysis query
    if (alert) {
      const seedPrompts: Record<string, Record<string, string>> = {
        energy_spike: {
          ko: `${alert.artistName}의 에너지가 급등한 이유를 분석해줘. 어떤 이벤트가 있었는지 알려줘.`,
          en: `Analyze why ${alert.artistName}'s energy is surging. What events are driving this?`,
          ja: `${alert.artistName}のエネルギーが急上昇した理由を分析して。何が起きているの？`,
          zh: `分析一下${alert.artistName}能量飙升的原因，发生了什么事？`,
        },
        energy_drop: {
          ko: `${alert.artistName}의 에너지가 하락한 이유를 분석해줘. 팬으로서 어떻게 도울 수 있을까?`,
          en: `Analyze why ${alert.artistName}'s energy is dropping. How can fans help?`,
          ja: `${alert.artistName}のエネルギーが下落した理由を分析して。ファンとして何ができる？`,
          zh: `分析一下${alert.artistName}能量下降的原因，粉丝能做什么？`,
        },
        rank_1: {
          ko: `${alert.artistName}이(가) 1위를 달성했어! 어떤 요인이 1위를 이끌었는지 분석해줘.`,
          en: `${alert.artistName} hit #1! Analyze what factors drove them to the top.`,
          ja: `${alert.artistName}が1位を達成！何が1位に導いたか分析して。`,
          zh: `${alert.artistName}达到了第一名！分析是什么因素推动的。`,
        },
        milestone: {
          ko: `${alert.artistName}의 새로운 마일스톤에 대해 자세히 알려줘.`,
          en: `Tell me more about ${alert.artistName}'s new milestone.`,
          ja: `${alert.artistName}の新しいマイルストーンについて詳しく教えて。`,
          zh: `详细介绍一下${alert.artistName}的新里程碑。`,
        },
      };
      const lang = localStorage.getItem("ktrenz-language") || "ko";
      const prompts = seedPrompts[alert.type] || seedPrompts.energy_spike;
      const message = prompts[lang] || prompts.en;

      localStorage.setItem("ktrenz_agent_seed", JSON.stringify({
        artistName: alert.artistName,
        message,
        createdAt: Date.now(),
      }));
    }
    setTimeout(() => {
      onDismiss();
      navigate("/agent");
    }, 300);
  };

  return (
    <Drawer open={open} onOpenChange={(v) => !v && handleClose()}>
      <DrawerContent className="mx-auto mb-2 rounded-2xl max-w-[480px]">
        <div className="px-5 py-5 space-y-4">
          {/* Header */}
          <div className="flex items-start gap-3">
            <Avatar className="w-12 h-12 border-2 border-primary/20 shrink-0">
              {alert.slot.avatar_url ? (
                <AvatarImage src={alert.slot.avatar_url} alt={alert.artistName} className="object-cover" />
              ) : (
                <AvatarFallback className="bg-primary/20 text-primary text-lg">
                  {alert.emoji}
                </AvatarFallback>
              )}
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-500 font-bold animate-pulse">
                  {t("alert.liveAlert")}
                </span>
              </div>
              <p className="text-base font-bold text-foreground">{alert.title}</p>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{alert.body}</p>
            </div>
            <button
              onClick={handleClose}
              className="shrink-0 p-1 rounded-full hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={handleClose}
              className="flex-1 h-10 rounded-xl bg-muted text-sm font-semibold text-foreground transition-colors hover:bg-muted/80"
            >
              {t("alert.dismiss")}
            </button>
            <button
              onClick={handleGoToChat}
              className="flex-1 h-10 rounded-xl bg-primary text-sm font-semibold text-primary-foreground flex items-center justify-center gap-1.5 transition-colors hover:bg-primary/90"
            >
              <MessageCircle className="w-4 h-4" />
              {t("alert.viewInChat")}
            </button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
