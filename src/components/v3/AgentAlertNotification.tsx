import React, { useState, useEffect, useMemo } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
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
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState<"enter" | "idle" | "exit">("enter");

  // Split body into caption lines
  const captionLines = useMemo(() => {
    if (!alert) return [];
    const raw = alert.body || "";
    // Split on periods, exclamation marks, or question marks followed by space
    const parts = raw.split(/(?<=[.!?。！？])\s+/).filter(Boolean);
    return parts.length > 0 ? parts : [raw];
  }, [alert]);

  useEffect(() => {
    if (alert) {
      const timer = setTimeout(() => {
        setVisible(true);
        setPhase("enter");
      }, 100);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
      setPhase("enter");
    }
  }, [alert]);

  if (!alert || !visible) return null;

  const handleClose = () => {
    setPhase("exit");
    setTimeout(() => {
      setVisible(false);
      onDismiss();
    }, 400);
  };

  const handleGoToChat = () => {
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
    setPhase("exit");
    setTimeout(() => {
      setVisible(false);
      onDismiss();
      navigate("/agent");
    }, 400);
  };

  const isExiting = phase === "exit";

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center transition-all duration-500 ${
        isExiting ? "opacity-0" : "opacity-100"
      }`}
      style={{ background: "rgba(0, 0, 0, 0.85)", backdropFilter: "blur(12px)" }}
      onClick={handleClose}
    >
      {/* Close button */}
      <button
        onClick={(e) => { e.stopPropagation(); handleClose(); }}
        className="absolute top-4 right-4 p-2 rounded-full text-white/60 hover:text-white transition-colors z-10"
        style={{ paddingTop: "env(safe-area-inset-top, 16px)" }}
      >
        <X className="w-6 h-6" />
      </button>

      {/* Content container */}
      <div
        className="flex flex-col items-center gap-6 px-8 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Avatar + LIVE badge */}
        <div
          className={`flex flex-col items-center gap-3 transition-all duration-700 ${
            isExiting ? "opacity-0 scale-90" : "opacity-100 scale-100"
          }`}
          style={{ animationDelay: "0ms" }}
        >
          <Avatar className="w-20 h-20 border-2 border-primary/40 shadow-[0_0_30px_rgba(234,88,12,0.3)]">
            {alert.slot.avatar_url ? (
              <AvatarImage src={alert.slot.avatar_url} alt={alert.artistName} className="object-cover" />
            ) : (
              <AvatarFallback className="bg-primary/20 text-primary text-3xl">
                {alert.emoji}
              </AvatarFallback>
            )}
          </Avatar>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-bold tracking-wider uppercase animate-pulse">
            {t("alert.liveAlert")}
          </span>
        </div>

        {/* Title - Reels-style caption */}
        <h2
          className="text-xl font-bold text-white text-center leading-snug caption-line"
          style={{
            animationDelay: "200ms",
            animationFillMode: "both",
            textShadow: "0 2px 20px rgba(0,0,0,0.8)",
          }}
        >
          {alert.title}
        </h2>

        {/* Body lines - staggered Reels captions */}
        <div className="flex flex-col items-center gap-3 w-full">
          {captionLines.map((line, i) => (
            <p
              key={i}
              className="text-[15px] text-white/80 text-center leading-relaxed caption-line font-medium"
              style={{
                animationDelay: `${400 + i * 300}ms`,
                animationFillMode: "both",
                textShadow: "0 1px 12px rgba(0,0,0,0.6)",
              }}
            >
              {line}
            </p>
          ))}
        </div>

        {/* Actions */}
        <div
          className="flex gap-3 w-full mt-4 caption-line"
          style={{
            animationDelay: `${400 + captionLines.length * 300 + 200}ms`,
            animationFillMode: "both",
          }}
        >
          <button
            onClick={handleClose}
            className="flex-1 h-12 rounded-2xl bg-white/10 text-sm font-semibold text-white/80 transition-colors hover:bg-white/20 backdrop-blur-sm"
          >
            {t("alert.dismiss")}
          </button>
          <button
            onClick={handleGoToChat}
            className="flex-1 h-12 rounded-2xl bg-primary text-sm font-semibold text-primary-foreground flex items-center justify-center gap-1.5 transition-colors hover:bg-primary/90 shadow-[0_0_20px_rgba(234,88,12,0.4)]"
          >
            <MessageCircle className="w-4 h-4" />
            {t("alert.viewInChat")}
          </button>
        </div>
      </div>
    </div>
  );
}
