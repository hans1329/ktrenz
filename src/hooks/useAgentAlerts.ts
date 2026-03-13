import { useEffect, useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAgentSlots, type AgentSlot } from "@/hooks/useAgentSlots";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Language } from "@/i18n/translations";

// ── Types ──
export interface AgentAlert {
  id: string;
  type: "rank_1" | "energy_spike" | "energy_drop" | "milestone";
  artistName: string;
  wikiEntryId: string;
  title: string;
  body: string;
  emoji: string;
  slot: AgentSlot;
  timestamp: number;
}

// ── Alert message templates ──
function buildAlertMessages(
  type: AgentAlert["type"],
  artistName: string,
  lang: Language,
  extra?: { change?: number; category?: string; milestoneType?: string; milestoneData?: any },
): { title: string; body: string; emoji: string } {
  const abs = Math.abs(extra?.change ?? 0).toFixed(1);
  const cat = extra?.category ?? "";

  const templates: Record<string, Record<Language, { title: string; body: string; emoji: string }>> = {
    rank_1: {
      ko: { title: `🏆 ${artistName} 1위 달성!`, body: `${artistName}이(가) 트렌드 랭킹 1위를 차지했어요! 지금 가장 뜨거운 아티스트예요!`, emoji: "🏆" },
      en: { title: `🏆 ${artistName} hits #1!`, body: `${artistName} is now #1 in Trend Rankings! The hottest artist right now!`, emoji: "🏆" },
      ja: { title: `🏆 ${artistName}が1位に!`, body: `${artistName}がトレンドランキング1位を獲得しました！今一番ホットなアーティストです！`, emoji: "🏆" },
      zh: { title: `🏆 ${artistName}登顶第一!`, body: `${artistName}在趋势排行榜中夺得第一！现在最火的艺人！`, emoji: "🏆" },
    },
    energy_spike: {
      ko: { title: `🔥 ${artistName} ${cat} 급등!`, body: `${artistName}의 ${cat} 에너지가 24시간 동안 +${abs}% 급등했어요! 무슨 일이 일어나고 있는지 확인해보세요!`, emoji: "🔥" },
      en: { title: `🔥 ${artistName} ${cat} surging!`, body: `${artistName}'s ${cat} energy surged +${abs}% in 24h! Check what's happening!`, emoji: "🔥" },
      ja: { title: `🔥 ${artistName} ${cat}が急上昇!`, body: `${artistName}の${cat}エネルギーが24時間で+${abs}%急上昇しました！`, emoji: "🔥" },
      zh: { title: `🔥 ${artistName} ${cat}飙升!`, body: `${artistName}的${cat}能量在24小时内飙升+${abs}%！看看发生了什么！`, emoji: "🔥" },
    },
    energy_drop: {
      ko: { title: `📉 ${artistName} ${cat} 급락!`, body: `${artistName}의 ${cat} 에너지가 24시간 동안 ${abs}% 하락했어요. 지금 응원이 필요해요!`, emoji: "📉" },
      en: { title: `📉 ${artistName} ${cat} dropping!`, body: `${artistName}'s ${cat} energy dropped ${abs}% in 24h. They need your support!`, emoji: "📉" },
      ja: { title: `📉 ${artistName} ${cat}が急落!`, body: `${artistName}の${cat}エネルギーが24時間で${abs}%下落しました。応援が必要です！`, emoji: "📉" },
      zh: { title: `📉 ${artistName} ${cat}急跌!`, body: `${artistName}的${cat}能量在24小时内下跌${abs}%。现在需要你的支持！`, emoji: "📉" },
    },
    milestone: {
      ko: { title: `🎉 ${artistName} 빌보드 첫 진입!`, body: `${artistName}이(가) 빌보드 차트에 처음으로 진입했어요! 역사적인 순간이에요! 🇺🇸`, emoji: "🎉" },
      en: { title: `🎉 ${artistName} Billboard debut!`, body: `${artistName} entered the Billboard chart for the first time! A historic moment! 🇺🇸`, emoji: "🎉" },
      ja: { title: `🎉 ${artistName} ビルボード初登場!`, body: `${artistName}がビルボードチャートに初めて登場しました！歴史的な瞬間です！ 🇺🇸`, emoji: "🎉" },
      zh: { title: `🎉 ${artistName} 首登Billboard!`, body: `${artistName}首次登上Billboard排行榜！历史性的时刻！ 🇺🇸`, emoji: "🎉" },
    },
  };

  return templates[type]?.[lang] ?? templates[type]?.en ?? { title: "", body: "", emoji: "📢" };
}

// ── Threshold constants ──
const SPIKE_THRESHOLD = 15; // ±15% 24h change
const ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6h cooldown per alert type per artist

function getAlertCooldownKey(wikiEntryId: string, type: string) {
  return `ktrenz_alert_${type}_${wikiEntryId}`;
}

function isAlertCoolingDown(wikiEntryId: string, type: string): boolean {
  try {
    const raw = localStorage.getItem(getAlertCooldownKey(wikiEntryId, type));
    if (!raw) return false;
    return Date.now() - parseInt(raw, 10) < ALERT_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function markAlertSent(wikiEntryId: string, type: string) {
  localStorage.setItem(getAlertCooldownKey(wikiEntryId, type), String(Date.now()));
}

// ── Save alert to chat ──
async function saveAlertToChat(
  userId: string,
  agentSlotId: string | null,
  alertTitle: string,
  alertBody: string,
  emoji: string,
) {
  try {
    await (supabase as any)
      .from("ktrenz_fan_agent_messages")
      .insert({
        user_id: userId,
        agent_slot_id: agentSlotId,
        role: "assistant",
        mode: "alert",
        content: `${emoji} **${alertTitle}**\n\n${alertBody}`,
      });
  } catch (e) {
    console.error("Failed to save alert to chat:", e);
  }
}

// ── Main Hook ──
export function useAgentAlerts() {
  const { user } = useAuth();
  const { slots } = useAgentSlots();
  const { language } = useLanguage();
  const [pendingAlert, setPendingAlert] = useState<AgentAlert | null>(null);

  // Only check for agent slots with registered artists
  const registeredSlots = slots.filter(s => s.wiki_entry_id);
  const wikiEntryIds = registeredSlots.map(s => s.wiki_entry_id!);

  // Fetch scores for registered artists
  const { data: scores } = useQuery({
    queryKey: ["agent-alert-scores", ...wikiEntryIds],
    queryFn: async () => {
      if (wikiEntryIds.length === 0) return [];
      const { data } = await supabase
        .from("v3_scores_v2" as any)
        .select("wiki_entry_id, energy_score, energy_change_24h, energy_rank, youtube_change_24h, buzz_change_24h, music_change_24h, album_change_24h")
        .in("wiki_entry_id", wikiEntryIds);
      return (data ?? []) as any[];
    },
    enabled: !!user?.id && wikiEntryIds.length > 0,
    staleTime: 1000 * 60 * 5, // 5 min
    refetchInterval: 1000 * 60 * 10, // refetch every 10 min
  });

  // Fetch unnotified milestones
  const { data: milestones } = useQuery({
    queryKey: ["agent-alert-milestones", ...wikiEntryIds],
    queryFn: async () => {
      if (wikiEntryIds.length === 0) return [];
      const { data } = await supabase
        .from("ktrenz_milestone_events" as any)
        .select("*")
        .in("wiki_entry_id", wikiEntryIds)
        .eq("notified", false);
      return (data ?? []) as any[];
    },
    enabled: !!user?.id && wikiEntryIds.length > 0,
    staleTime: 1000 * 60 * 5,
  });

  // Process alerts
  const processAlerts = useCallback(() => {
    if (!user?.id || !scores || pendingAlert) return;

    const alerts: AgentAlert[] = [];

    for (const score of scores) {
      const slot = registeredSlots.find(s => s.wiki_entry_id === score.wiki_entry_id);
      if (!slot) continue;
      const artistName = slot.artist_name ?? "Artist";

      // Rank #1 alert
      if (score.energy_rank === 1 && !isAlertCoolingDown(score.wiki_entry_id, "rank_1")) {
        const msg = buildAlertMessages("rank_1", artistName, language);
        alerts.push({
          id: `rank_1_${score.wiki_entry_id}`,
          type: "rank_1",
          artistName,
          wikiEntryId: score.wiki_entry_id,
          ...msg,
          slot,
          timestamp: Date.now(),
        });
      }

      // Energy spike/drop per category
      const categories = [
        { key: "YouTube", change: score.youtube_change_24h },
        { key: "Buzz", change: score.buzz_change_24h },
        { key: "Music", change: score.music_change_24h },
        { key: "Album", change: score.album_change_24h },
      ];

      for (const cat of categories) {
        const change = cat.change ?? 0;
        if (Math.abs(change) >= SPIKE_THRESHOLD) {
          const type = change > 0 ? "energy_spike" : "energy_drop";
          const alertKey = `${type}_${cat.key}`;
          if (!isAlertCoolingDown(score.wiki_entry_id, alertKey)) {
            const msg = buildAlertMessages(type, artistName, language, { change, category: cat.key });
            alerts.push({
              id: `${alertKey}_${score.wiki_entry_id}`,
              type,
              artistName,
              wikiEntryId: score.wiki_entry_id,
              ...msg,
              slot,
              timestamp: Date.now(),
            });
          }
        }
      }
    }

    // Milestone alerts
    if (milestones) {
      for (const m of milestones) {
        const slot = registeredSlots.find(s => s.wiki_entry_id === m.wiki_entry_id);
        if (!slot) continue;
        const artistName = slot.artist_name ?? "Artist";
        const alertKey = `milestone_${m.event_type}`;
        if (!isAlertCoolingDown(m.wiki_entry_id, alertKey)) {
          const msg = buildAlertMessages("milestone", artistName, language, { milestoneType: m.event_type, milestoneData: m.event_data });
          alerts.push({
            id: `${alertKey}_${m.wiki_entry_id}`,
            type: "milestone",
            artistName,
            wikiEntryId: m.wiki_entry_id,
            ...msg,
            slot,
            timestamp: Date.now(),
          });
        }
      }
    }

    // Show the first alert (queue style — one at a time)
    if (alerts.length > 0) {
      const alert = alerts[0];
      markAlertSent(alert.wikiEntryId, alert.id.split(`_${alert.wikiEntryId}`)[0]);
      saveAlertToChat(user.id, alert.slot.id, alert.title, alert.body, alert.emoji);

      // Mark milestone as notified
      if (alert.type === "milestone" && milestones) {
        const milestone = milestones.find(m => m.wiki_entry_id === alert.wikiEntryId);
        if (milestone) {
          supabase
            .from("ktrenz_milestone_events" as any)
            .update({ notified: true })
            .eq("id", milestone.id)
            .then(() => {});
        }
      }

      setPendingAlert(alert);
    }
  }, [user?.id, scores, milestones, registeredSlots, language, pendingAlert]);

  useEffect(() => {
    // Small delay to avoid blocking initial render
    const timer = setTimeout(processAlerts, 3000);
    return () => clearTimeout(timer);
  }, [processAlerts]);

  const dismissAlert = useCallback(() => setPendingAlert(null), []);

  return { pendingAlert, dismissAlert };
}
