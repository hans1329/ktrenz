import React, { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAgentSlots, type AgentSlot } from "@/hooks/useAgentSlots";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { PartyPopper, Zap, TrendingUp, Target, Star, X } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Drawer, DrawerContent, DrawerClose,
} from "@/components/ui/drawer";

// ── Types ──────────────────────────────────────────────
export type FeedbackTrigger = "completion" | "briefing" | "inactivity" | "milestone";

export interface MissionStatus {
  completedCount: number;
  totalCount: number;
  totalPoints: number;
  allDone: boolean;
  lastCompletedCategory?: string;
  lastCompletedTitle?: string;
  weakCategories?: string[];
  artistName: string;
  wikiEntryId: string;
}

interface FeedbackMessage {
  text: string;
  emoji: string;
  useAI?: boolean;
}

// ── Template-based feedback generator ──────────────────
function generateFeedback(
  trigger: FeedbackTrigger,
  status: MissionStatus,
  lang: string,
): FeedbackMessage {
  const { completedCount, totalCount, totalPoints, allDone, lastCompletedCategory, weakCategories, artistName } = status;
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const templates: Record<string, Record<FeedbackTrigger, FeedbackMessage[]>> = {
    ko: {
      completion: [
        { text: `미션 완료! 벌써 ${completedCount}/${totalCount}개 달성 💪 ${artistName} 위해 오늘도 힘내고 있네요!`, emoji: "🎉" },
        { text: `+${totalPoints}P 획득 중! ${progress}% 진행 — 이 페이스면 올클리어 가능해요!`, emoji: "🔥" },
        { text: `${lastCompletedCategory} 미션 성공! 다음 미션도 바로 도전해볼까요?`, emoji: "⚡" },
        { text: `대단해요! ${completedCount}개째 미션 클리어! ${artistName}의 에너지가 올라가고 있어요 📈`, emoji: "💖" },
      ],
      briefing: [
        { text: `오늘 ${artistName}을(를) 위한 미션 ${totalCount}개가 준비되어 있어요! 현재 ${completedCount}개 완료, ${totalPoints}P 획득 중이에요.`, emoji: "📋" },
        { text: `반가워요! 오늘의 미션 현황: ${completedCount}/${totalCount} (${progress}%) — 함께 ${artistName} 응원해요!`, emoji: "👋" },
      ],
      inactivity: [
        { text: `미션 ${totalCount - completedCount}개 남았어요! 지금 하나만 더 해볼까요? ${artistName}이(가) 기다리고 있어요~`, emoji: "⏰" },
        { text: `아직 ${totalCount - completedCount}개 미션이 남아있어요. 자기 전에 하나만 더? 🌙`, emoji: "💬" },
        ...(weakCategories?.length ? [{ text: `이번 주 ${weakCategories[0]} 미션이 부족해요! 하나만 해볼까요?`, emoji: "🎯" }] : []),
      ],
      milestone: [
        { text: `🏆 올클리어! ${totalCount}개 미션 전부 완료! ${totalPoints}P 획득 — ${artistName}의 진정한 팬이에요!`, emoji: "🏆", useAI: true },
        { text: `대박! 오늘의 미션을 모두 완수했어요! ${artistName}의 팬 에너지 점수에 큰 기여를 했어요! 🎊`, emoji: "🎊", useAI: true },
      ],
    },
    en: {
      completion: [
        { text: `Mission done! ${completedCount}/${totalCount} completed 💪 You're crushing it for ${artistName}!`, emoji: "🎉" },
        { text: `+${totalPoints}P earned! ${progress}% progress — you're on track for a clean sweep!`, emoji: "🔥" },
        { text: `${lastCompletedCategory} mission complete! Ready for the next one?`, emoji: "⚡" },
        { text: `Amazing! ${completedCount} missions cleared! ${artistName}'s energy is rising 📈`, emoji: "💖" },
      ],
      briefing: [
        { text: `${totalCount} missions ready for ${artistName} today! Currently ${completedCount} done, ${totalPoints}P earned.`, emoji: "📋" },
        { text: `Hey there! Mission status: ${completedCount}/${totalCount} (${progress}%) — let's support ${artistName}!`, emoji: "👋" },
      ],
      inactivity: [
        { text: `${totalCount - completedCount} missions left! How about one more for ${artistName}?`, emoji: "⏰" },
        { text: `Still ${totalCount - completedCount} missions remaining. One more before bed? 🌙`, emoji: "💬" },
        ...(weakCategories?.length ? [{ text: `Your ${weakCategories[0]} missions need attention this week! Try one?`, emoji: "🎯" }] : []),
      ],
      milestone: [
        { text: `🏆 All clear! All ${totalCount} missions done! ${totalPoints}P earned — you're ${artistName}'s ultimate fan!`, emoji: "🏆", useAI: true },
        { text: `Incredible! Every mission completed! You've made a huge contribution to ${artistName}'s Fan Energy Score! 🎊`, emoji: "🎊", useAI: true },
      ],
    },
    ja: {
      completion: [
        { text: `ミッション完了！${completedCount}/${totalCount}達成 💪 ${artistName}のために今日も頑張ってますね！`, emoji: "🎉" },
        { text: `+${totalPoints}P獲得中！${progress}%進行中 — このペースなら全クリ可能！`, emoji: "🔥" },
        { text: `${lastCompletedCategory}ミッション成功！次のミッションも挑戦してみましょう？`, emoji: "⚡" },
      ],
      briefing: [
        { text: `今日${artistName}のためのミッション${totalCount}個が用意されています！現在${completedCount}個完了、${totalPoints}P獲得中。`, emoji: "📋" },
      ],
      inactivity: [
        { text: `ミッション${totalCount - completedCount}個残ってます！もう1つやってみませんか？`, emoji: "⏰" },
      ],
      milestone: [
        { text: `🏆 全クリア！${totalCount}個のミッション全て完了！${totalPoints}P獲得 — ${artistName}の真のファンです！`, emoji: "🏆", useAI: true },
      ],
    },
    zh: {
      completion: [
        { text: `任务完成！已完成 ${completedCount}/${totalCount} 💪 为${artistName}继续加油！`, emoji: "🎉" },
      ],
      briefing: [
        { text: `今天为${artistName}准备了${totalCount}个任务！目前完成${completedCount}个，获得${totalPoints}P。`, emoji: "📋" },
      ],
      inactivity: [
        { text: `还剩${totalCount - completedCount}个任务！再来一个吧？`, emoji: "⏰" },
      ],
      milestone: [
        { text: `🏆 全部完成！${totalCount}个任务全部搞定！获得${totalPoints}P — 你是${artistName}的终极粉丝！`, emoji: "🏆", useAI: true },
      ],
    },
  };

  const langTemplates = templates[lang] || templates.en;
  const pool = allDone && trigger === "completion"
    ? langTemplates.milestone
    : langTemplates[trigger];

  const randomIndex = Math.floor(Math.random() * pool.length);
  return pool[randomIndex];
}

// ── Save feedback to agent chat history ──────────────
async function saveFeedbackToChat(
  userId: string,
  wikiEntryId: string,
  feedbackText: string,
) {
  try {
    // Find the user's active agent slot for this artist
    const { data: slot } = await (supabase as any)
      .from("ktrenz_agent_slots")
      .select("id")
      .eq("user_id", userId)
      .eq("wiki_entry_id", wikiEntryId)
      .limit(1)
      .maybeSingle();

    if (!slot) return; // No agent for this artist, skip

    // Save as agent message
    await (supabase as any)
      .from("agent_chat_messages")
      .insert({
        user_id: userId,
        sender_type: "assistant",
        message: `🎯 **Mission Feedback**\n\n${feedbackText}`,
        topic_type: "mission_feedback",
        metadata: { wiki_entry_id: wikiEntryId, auto_generated: true },
      });
  } catch (e) {
    console.error("Failed to save feedback to chat:", e);
  }
}

// ── Fullscreen Celebration Modal (for mission completion) ──
function CelebrationModal({
  feedback,
  agentSlot,
  missionStatus,
  onClose,
}: {
  feedback: FeedbackMessage;
  agentSlot: AgentSlot | null;
  missionStatus: MissionStatus;
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    const timer = setTimeout(() => {
      setClosing(true);
      setTimeout(onClose, 400);
    }, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const isMilestone = missionStatus.allDone;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex items-center justify-center transition-opacity duration-300",
        closing ? "opacity-0" : "animate-in fade-in duration-200"
      )}
      onClick={() => { setClosing(true); setTimeout(onClose, 400); }}
    >
      <div
        className={cn(
          "absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 py-10 transition-all duration-300",
          "bg-gradient-to-b from-background/95 to-background/80 backdrop-blur-xl",
          closing ? "scale-150 opacity-0" : "animate-in zoom-in-95 duration-200"
        )}
        style={{
          maskImage: "radial-gradient(ellipse 90% 80% at 50% 50%, black 50%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 90% 80% at 50% 50%, black 50%, transparent 100%)",
        }}
      >
        {/* Agent avatar */}
        <Avatar className="w-16 h-16 border-2 border-primary/30 shadow-lg">
          {agentSlot?.avatar_url ? (
            <AvatarImage src={agentSlot.avatar_url} alt="agent" />
          ) : (
            <AvatarFallback className="bg-primary/20 text-primary text-xl">
              {agentSlot?.artist_name?.[0] || "🤖"}
            </AvatarFallback>
          )}
        </Avatar>


        {/* Feedback text */}
        <p className="text-base font-bold text-foreground text-center max-w-[300px] leading-relaxed">
          {feedback.text}
        </p>

        {/* Points */}
        <span className="text-2xl font-black text-amber-500">+{missionStatus.totalPoints}P</span>

        {/* Progress */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Target className="w-4 h-4" />
          <span className="font-bold">{missionStatus.completedCount}/{missionStatus.totalCount}</span>
        </div>

        {/* Timer bar */}
        <div className="h-1 w-48 bg-muted rounded-full overflow-hidden mt-2">
          <div className="h-full bg-primary rounded-full" style={{ animation: "shrink-bar 4s linear forwards" }} />
        </div>
      </div>
    </div>
  );
}

// ── Bottom Sheet Drawer (for briefing/inactivity) ──
function FeedbackDrawer({
  open,
  feedback,
  agentSlot,
  missionStatus,
  trigger,
  onClose,
}: {
  open: boolean;
  feedback: FeedbackMessage;
  agentSlot: AgentSlot | null;
  missionStatus: MissionStatus;
  trigger: FeedbackTrigger;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const isBriefing = trigger === "briefing";
  const progress = missionStatus.totalCount > 0
    ? Math.round((missionStatus.completedCount / missionStatus.totalCount) * 100)
    : 0;

  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent className="mx-2 mb-2 rounded-2xl">
        <div className="px-5 py-5 space-y-4">
          {/* Header with agent avatar */}
          <div className="flex items-start gap-3">
            <Avatar className="w-10 h-10 border border-primary/20 shrink-0 mt-0.5">
              {agentSlot?.avatar_url ? (
                <AvatarImage src={agentSlot.avatar_url} alt="agent" />
              ) : (
                <AvatarFallback className="bg-primary/20 text-primary text-sm">
                  {agentSlot?.artist_name?.[0] || "🤖"}
                </AvatarFallback>
              )}
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-bold text-foreground">
                  {agentSlot?.artist_name || "Agent"}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                  {isBriefing ? (t("mission.briefing") || "Briefing") : (t("mission.reminder") || "Reminder")}
                </span>
              </div>
              <p className="text-sm text-foreground/90 leading-relaxed">{feedback.text}</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-semibold">{t("mission.todaysMission") || "Today's Missions"}</span>
              <span className="font-bold text-primary">{missionStatus.completedCount}/{missionStatus.totalCount}</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-amber-400 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{progress}%</span>
              <span className="font-bold text-amber-500">+{missionStatus.totalPoints}P</span>
            </div>
          </div>

          {/* Weak category nudge */}
          {missionStatus.weakCategories && missionStatus.weakCategories.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <Star className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                {t("mission.weakCategoryHint") || `Try some ${missionStatus.weakCategories[0]} missions this week!`}
              </span>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// ── Main Hook ──────────────────────────────────────────
export function useAgentMissionFeedback(missionStatus: MissionStatus | null) {
  const { user } = useAuth();
  const { activeSlot, slots } = useAgentSlots();
  const { language } = useLanguage();
  const [feedbackState, setFeedbackState] = useState<{
    trigger: FeedbackTrigger;
    feedback: FeedbackMessage;
  } | null>(null);

  // Check if this artist is registered in any agent slot
  const matchingSlot = slots.find(s => s.wiki_entry_id === missionStatus?.wikiEntryId) ?? null;
  const isRegisteredAgent = !!matchingSlot;

  const BRIEFING_KEY = `ktrenz_mission_briefing_${missionStatus?.wikiEntryId}`;
  const INACTIVITY_KEY = `ktrenz_mission_inactivity_${missionStatus?.wikiEntryId}`;

  // Show feedback — celebration modal for all, briefing/inactivity only for registered agents
  const showFeedback = useCallback((trigger: FeedbackTrigger, status: MissionStatus) => {
    if (!user?.id) return;
    // Briefing & inactivity only for registered agent artists
    if (!isRegisteredAgent && (trigger === "briefing" || trigger === "inactivity")) return;
    const feedback = generateFeedback(trigger, status, language);
    setFeedbackState({ trigger, feedback });

    // Save to chat history only for registered agents
    if (isRegisteredAgent) {
      saveFeedbackToChat(user.id, status.wikiEntryId, feedback.text);
    }
  }, [user?.id, language, isRegisteredAgent]);

  // Trigger: mission completion
  const onMissionComplete = useCallback((status: MissionStatus) => {
    const trigger: FeedbackTrigger = status.allDone ? "milestone" : "completion";
    showFeedback(trigger, status);
  }, [showFeedback]);

  // Trigger: page entry briefing (once per day per artist)
  useEffect(() => {
    if (!missionStatus || !user?.id) return;
    if (missionStatus.totalCount === 0) return;

    const today = new Date().toISOString().slice(0, 10);
    const lastBriefing = localStorage.getItem(BRIEFING_KEY);
    if (lastBriefing === today) return;

    // Show briefing after a short delay
    const timer = setTimeout(() => {
      localStorage.setItem(BRIEFING_KEY, today);
      showFeedback("briefing", missionStatus);
    }, 2000);

    return () => clearTimeout(timer);
  }, [missionStatus?.wikiEntryId, missionStatus?.totalCount, user?.id]);

  // Trigger: inactivity (5 min with remaining missions)
  useEffect(() => {
    if (!missionStatus || !user?.id) return;
    if (missionStatus.allDone || missionStatus.totalCount === 0) return;
    if (missionStatus.completedCount === 0) return; // Only nudge if they've started

    const today = new Date().toISOString().slice(0, 10);
    const lastInactivity = localStorage.getItem(INACTIVITY_KEY);
    if (lastInactivity === today) return;

    const timer = setTimeout(() => {
      localStorage.setItem(INACTIVITY_KEY, today);
      showFeedback("inactivity", missionStatus);
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearTimeout(timer);
  }, [missionStatus?.completedCount, missionStatus?.wikiEntryId, user?.id]);

  const closeFeedback = useCallback(() => setFeedbackState(null), []);

  return {
    feedbackState,
    activeSlot: matchingSlot,
    onMissionComplete,
    closeFeedback,
  };
}

// ── Renderer Component ──────────────────────────────────
export default function AgentMissionFeedback({
  feedbackState,
  agentSlot,
  missionStatus,
  onClose,
}: {
  feedbackState: { trigger: FeedbackTrigger; feedback: FeedbackMessage } | null;
  agentSlot: AgentSlot | null;
  missionStatus: MissionStatus;
  onClose: () => void;
}) {
  if (!feedbackState) return null;

  const { trigger, feedback } = feedbackState;

  // Fullscreen modal for completion/milestone
  if (trigger === "completion" || trigger === "milestone") {
    return (
      <CelebrationModal
        feedback={feedback}
        agentSlot={agentSlot}
        missionStatus={missionStatus}
        onClose={onClose}
      />
    );
  }

  // Bottom sheet for briefing/inactivity
  return (
    <FeedbackDrawer
      open={true}
      feedback={feedback}
      agentSlot={agentSlot}
      missionStatus={missionStatus}
      trigger={trigger}
      onClose={onClose}
    />
  );
}
