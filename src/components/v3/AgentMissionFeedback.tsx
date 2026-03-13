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

// ── Category-based action & impact descriptions ──────
const categoryFeedback: Record<string, Record<string, { action: string[]; impact: string[] }>> = {
  ko: {
    youtube: {
      action: ["영상을 시청했어요!", "유튜브 조회수에 기여했어요!"],
      impact: [
        "조회수가 올라가면 유튜브 알고리즘이 더 많은 사람에게 영상을 추천해요 📈",
        "영상 시청은 아티스트의 유튜브 랭킹과 수익에 직접적으로 기여해요 💰",
        "조회수 증가 → 트렌딩 진입 → 신규 팬 유입의 선순환이 시작돼요 🔄",
      ],
    },
    news: {
      action: ["기사를 읽었어요!", "뉴스 트래픽에 기여했어요!"],
      impact: [
        "기사 클릭수가 높아지면 미디어가 더 많은 관련 기사를 작성해요 📰",
        "뉴스 관심도는 방송 출연과 브랜드 협찬에 영향을 줘요 ✨",
        "미디어 버즈가 올라가면 아티스트의 인지도와 영향력이 커져요 📊",
      ],
    },
    buzz: {
      action: ["SNS에서 활동했어요!", "소셜 버즈를 만들었어요!"],
      impact: [
        "SNS 언급이 늘면 트렌딩에 오르고 더 많은 팬이 관심을 가져요 🔥",
        "해시태그 활동은 아티스트의 온라인 존재감을 높여줘요 💬",
        "팬들의 소셜 활동은 음원 차트와 투표에도 간접적으로 영향을 줘요 📱",
      ],
    },
    music: {
      action: ["음악을 스트리밍했어요!", "스트리밍 수에 기여했어요!"],
      impact: [
        "스트리밍 수는 음원 차트 순위에 직접 반영돼요 🎵",
        "차트 성적이 좋으면 음악방송 출연과 수상에 유리해요 🏆",
        "스트리밍은 아티스트의 수익과 차기 앨범 투자에 직결돼요 💎",
      ],
    },
  },
  en: {
    youtube: {
      action: ["You watched a video!", "You contributed to YouTube views!"],
      impact: [
        "More views help the YouTube algorithm recommend the video to more people 📈",
        "Video views directly contribute to the artist's YouTube ranking and revenue 💰",
        "Views → Trending → New fans: you're starting a positive cycle 🔄",
      ],
    },
    news: {
      action: ["You read an article!", "You boosted news traffic!"],
      impact: [
        "Higher article clicks encourage media to write more coverage 📰",
        "News attention influences broadcast appearances and brand deals ✨",
        "Media buzz increases the artist's recognition and influence 📊",
      ],
    },
    buzz: {
      action: ["You engaged on social media!", "You created social buzz!"],
      impact: [
        "More SNS mentions help trend and attract new fans 🔥",
        "Hashtag activity boosts the artist's online presence 💬",
        "Fan social activity indirectly impacts music charts and votes 📱",
      ],
    },
    music: {
      action: ["You streamed music!", "You contributed to streaming numbers!"],
      impact: [
        "Streaming counts directly affect music chart rankings 🎵",
        "Better chart performance leads to more show appearances and awards 🏆",
        "Streaming directly supports the artist's revenue and future albums 💎",
      ],
    },
  },
  ja: {
    youtube: {
      action: ["動画を視聴しました！"],
      impact: ["再生回数が増えるとYouTubeアルゴリズムがより多くの人に推薦します 📈"],
    },
    news: {
      action: ["記事を読みました！"],
      impact: ["記事クリック数が増えるとメディアがもっと記事を書きます 📰"],
    },
    buzz: {
      action: ["SNSで活動しました！"],
      impact: ["SNSの言及が増えるとトレンドに乗ります 🔥"],
    },
    music: {
      action: ["音楽をストリーミングしました！"],
      impact: ["ストリーミング数は音楽チャート順位に直接反映されます 🎵"],
    },
  },
  zh: {
    youtube: {
      action: ["你观看了视频！"],
      impact: ["播放量增加会让YouTube算法推荐给更多人 📈"],
    },
    news: {
      action: ["你阅读了文章！"],
      impact: ["文章点击量增加会促使媒体写更多报道 📰"],
    },
    buzz: {
      action: ["你参与了社交媒体！"],
      impact: ["社交媒体提及增加有助于登上趋势 🔥"],
    },
    music: {
      action: ["你收听了音乐！"],
      impact: ["播放量直接影响音乐排行榜排名 🎵"],
    },
  },
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Template-based feedback generator ──────────────────
function generateFeedback(
  trigger: FeedbackTrigger,
  status: MissionStatus,
  lang: string,
): FeedbackMessage {
  const { completedCount, totalCount, totalPoints, allDone, lastCompletedCategory, artistName } = status;
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // For completion/milestone: use category-based action + impact
  if (trigger === "completion" || trigger === "milestone") {
    const langData = categoryFeedback[lang] || categoryFeedback.en;
    const cat = lastCompletedCategory && langData[lastCompletedCategory]
      ? lastCompletedCategory
      : "youtube"; // fallback
    const catData = langData[cat];
    const action = pickRandom(catData.action);
    const impact = pickRandom(catData.impact);

    if (allDone) {
      const allClearMsg = lang === "ko"
        ? `🏆 올클리어! ${totalCount}개 미션 전부 완료! ${artistName}의 진정한 팬이에요!`
        : lang === "ja" ? `🏆 全クリア！${totalCount}個のミッション全て完了！${artistName}の真のファンです！`
        : lang === "zh" ? `🏆 全部完成！${totalCount}个任务全部搞定！你是${artistName}的终极粉丝！`
        : `🏆 All clear! All ${totalCount} missions done! You're ${artistName}'s ultimate fan!`;
      return {
        text: `${action}\n\n${impact}\n\n${allClearMsg}`,
        emoji: "🏆",
        useAI: true,
      };
    }

    return {
      text: `${action}\n\n${impact}`,
      emoji: trigger === "completion" ? "🎉" : "🏆",
    };
  }

  // Briefing & inactivity templates (unchanged logic)
  const briefingTemplates: Record<string, FeedbackMessage[]> = {
    ko: [
      { text: `오늘 ${artistName}을(를) 위한 미션 ${totalCount}개가 준비되어 있어요! 현재 ${completedCount}개 완료, ${totalPoints}P 획득 중이에요.`, emoji: "📋" },
      { text: `반가워요! 오늘의 미션 현황: ${completedCount}/${totalCount} (${progress}%) — 함께 ${artistName} 응원해요!`, emoji: "👋" },
    ],
    en: [
      { text: `${totalCount} missions ready for ${artistName} today! Currently ${completedCount} done, ${totalPoints}P earned.`, emoji: "📋" },
      { text: `Hey there! Mission status: ${completedCount}/${totalCount} (${progress}%) — let's support ${artistName}!`, emoji: "👋" },
    ],
    ja: [
      { text: `今日${artistName}のためのミッション${totalCount}個が用意されています！現在${completedCount}個完了、${totalPoints}P獲得中。`, emoji: "📋" },
    ],
    zh: [
      { text: `今天为${artistName}准备了${totalCount}个任务！目前完成${completedCount}个，获得${totalPoints}P。`, emoji: "📋" },
    ],
  };

  const inactivityTemplates: Record<string, FeedbackMessage[]> = {
    ko: [
      { text: `미션 ${totalCount - completedCount}개 남았어요! 지금 하나만 더 해볼까요? ${artistName}이(가) 기다리고 있어요~`, emoji: "⏰" },
    ],
    en: [
      { text: `${totalCount - completedCount} missions left! How about one more for ${artistName}?`, emoji: "⏰" },
    ],
    ja: [
      { text: `ミッション${totalCount - completedCount}個残ってます！もう1つやってみませんか？`, emoji: "⏰" },
    ],
    zh: [
      { text: `还剩${totalCount - completedCount}个任务！再来一个吧？`, emoji: "⏰" },
    ],
  };

  const pool = trigger === "briefing"
    ? (briefingTemplates[lang] || briefingTemplates.en)
    : (inactivityTemplates[lang] || inactivityTemplates.en);

  return pickRandom(pool);
}

// ── Save feedback to agent chat history ──────────────
async function saveFeedbackToChat(
  userId: string,
  wikiEntryId: string,
  feedbackText: string,
) {
  try {
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
    }, 6000);
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


        {/* Feedback text — action + impact */}
        <div className="text-center max-w-[300px] space-y-2">
          {feedback.text.split("\n\n").map((line, i) => (
            <p key={i} className={cn(
              "leading-relaxed",
              i === 0 ? "text-base font-bold text-foreground" : "text-sm text-muted-foreground"
            )}>
              {line}
            </p>
          ))}
        </div>

        {/* Points */}
        <span className="text-2xl font-black text-amber-500">+{missionStatus.totalPoints}P</span>

        {/* Progress */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Target className="w-4 h-4" />
          <span className="font-bold">{missionStatus.completedCount}/{missionStatus.totalCount}</span>
        </div>

        {/* Timer bar */}
        <div className="h-1 w-48 bg-muted rounded-full overflow-hidden mt-2">
          <div className="h-full bg-primary rounded-full" style={{ animation: "shrink-bar 6s linear forwards" }} />
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

    // Save completion feedback to chat history for all users
    if (trigger === "completion" || trigger === "milestone") {
      saveFeedbackToChat(user.id, status.wikiEntryId, feedback.text);
    } else if (isRegisteredAgent) {
      // Briefing/inactivity only for registered agents
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
