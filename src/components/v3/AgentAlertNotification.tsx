import React, { useState, useEffect, useMemo, useCallback } from "react";
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
  const [currentLine, setCurrentLine] = useState(0);

  // Split body into caption lines
  const captionLines = useMemo(() => {
    if (!alert) return [];
    const raw = alert.body || "";
    // Aggressively split into short chunks (~20 chars target)
    const MAX_LEN = 25;

    function splitChunk(text: string): string[] {
      const trimmed = text.trim();
      if (!trimmed) return [];
      if (trimmed.length <= MAX_LEN) return [trimmed];

      // Try comma/semicolon split
      const commaParts = trimmed.split(/(?<=[,;，；])\s*/).filter(Boolean);
      if (commaParts.length > 1) {
        return commaParts.flatMap(p => splitChunk(p));
      }

      // Split at nearest space to midpoint
      const mid = Math.floor(trimmed.length / 2);
      let splitAt = -1;
      for (let d = 0; d <= mid; d++) {
        if (mid + d < trimmed.length && trimmed[mid + d] === " ") { splitAt = mid + d; break; }
        if (mid - d >= 0 && trimmed[mid - d] === " ") { splitAt = mid - d; break; }
      }
      if (splitAt > 0 && splitAt < trimmed.length - 1) {
        return [
          ...splitChunk(trimmed.slice(0, splitAt)),
          ...splitChunk(trimmed.slice(splitAt + 1)),
        ];
      }
      return [trimmed];
    }

    const sentences = raw.split(/(?<=[.!?。！？])\s*/).filter(Boolean);
    const chunks = sentences.flatMap(s => splitChunk(s));
    return [alert.title, ...chunks];
  }, [alert]);

  // Rotate through lines
  useEffect(() => {
    if (!visible || phase === "exit" || captionLines.length === 0) return;

    // Start showing first line after enter
    const startTimer = setTimeout(() => {
      setCurrentLine(0);
    }, 300);

    // Cycle lines every 2.5s
    const interval = setInterval(() => {
      setCurrentLine((prev) => {
        const next = prev + 1;
        return next < captionLines.length ? next : 0;
      });
    }, 2800);

    return () => {
      clearTimeout(startTimer);
      clearInterval(interval);
    };
  }, [visible, phase, captionLines.length]);

  useEffect(() => {
    if (alert) {
      setCurrentLine(0);
      const timer = setTimeout(() => {
        setVisible(true);
        setPhase("enter");
      }, 100);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
      setPhase("enter");
      setCurrentLine(0);
    }
  }, [alert]);

  const handleClose = useCallback(() => {
    setPhase("exit");
    setTimeout(() => {
      setVisible(false);
      onDismiss();
    }, 400);
  }, [onDismiss]);

  const handleGoToChat = useCallback(() => {
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
  }, [alert, navigate, onDismiss]);

  if (!alert || !visible) return null;

  const isExiting = phase === "exit";
  const isTitle = currentLine === 0;

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center transition-opacity duration-500 ${
        isExiting ? "opacity-0" : "opacity-100"
      }`}
      style={{ background: "rgba(0, 0, 0, 0.25)", backdropFilter: "blur(8px)" }}
      onClick={handleClose}
    >
      {/* Close */}
      <button
        onClick={(e) => { e.stopPropagation(); handleClose(); }}
        className="absolute top-4 right-4 p-2 rounded-full text-white/40 hover:text-white/80 transition-colors z-10"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Dot indicators */}
      <div className="absolute top-5 left-1/2 -translate-x-1/2 flex gap-1.5">
        {captionLines.map((_, i) => (
          <div
            key={i}
            className={`h-1 rounded-full transition-all duration-300 ${
              i === currentLine
                ? "w-5 bg-white/80"
                : "w-1 bg-white/25"
            }`}
          />
        ))}
      </div>

      {/* Center content */}
      <div
        className="flex flex-col items-center gap-8 px-10 max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Avatar + LIVE - always visible */}
        <div className={`flex flex-col items-center gap-2 transition-all duration-500 ${
          isExiting ? "opacity-0 scale-90" : "opacity-100 scale-100"
        }`}>
          <Avatar className="w-16 h-16 border border-primary/30 shadow-[0_0_40px_rgba(234,88,12,0.2)]">
            {alert.slot.avatar_url ? (
              <AvatarImage src={alert.slot.avatar_url} alt={alert.artistName} className="object-cover" />
            ) : (
              <AvatarFallback className="bg-primary/20 text-primary text-2xl">
                {alert.emoji}
              </AvatarFallback>
            )}
          </Avatar>
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 font-bold tracking-widest uppercase animate-pulse">
            {t("alert.liveAlert")}
          </span>
        </div>

        {/* Rotating caption - single line at a time */}
        <div className="min-h-[100px] flex items-center justify-center w-full">
          <p
            key={currentLine}
            className={`text-center font-bold leading-snug caption-rotate rounded-2xl px-6 py-4 ${
              isTitle
                ? "text-3xl text-white bg-black/50 backdrop-blur-md"
                : "text-xl text-white/95 bg-black/40 backdrop-blur-md"
            }`}
            style={{
              textShadow: "0 1px 8px rgba(0,0,0,0.4)",
            }}
          >
            {captionLines[currentLine]}
          </p>
        </div>

        {/* Actions */}
        <div className={`flex gap-3 w-full transition-all duration-500 delay-500 ${
          isExiting ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"
        }`}>
          <button
            onClick={handleClose}
            className="flex-1 h-11 rounded-2xl bg-white/8 border border-white/10 text-sm font-medium text-white/70 transition-colors hover:bg-white/15"
          >
            {t("alert.dismiss")}
          </button>
          <button
            onClick={handleGoToChat}
            className="flex-1 h-11 rounded-2xl bg-primary/90 text-sm font-semibold text-primary-foreground flex items-center justify-center gap-1.5 transition-colors hover:bg-primary shadow-[0_0_24px_rgba(234,88,12,0.3)]"
          >
            <MessageCircle className="w-4 h-4" />
            {t("alert.viewInChat")}
          </button>
        </div>
      </div>
    </div>
  );
}
