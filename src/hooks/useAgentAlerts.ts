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
  type: "rank_1" | "trend_spike" | "milestone";
  artistName: string;
  wikiEntryId: string;
  title: string;
  body: string;
  emoji: string;
  slot: AgentSlot;
  timestamp: number;
}

export interface GroupedAgentAlert {
  artistName: string;
  wikiEntryId: string;
  slot: AgentSlot;
  alerts: AgentAlert[];
}

// ── Alert message templates (T2-based) ──
function buildAlertMessages(
  type: AgentAlert["type"],
  artistName: string,
  lang: Language,
  extra?: { keywordCount?: number; topKeyword?: string; milestoneType?: string; milestoneData?: any },
): { title: string; body: string; emoji: string } {
  const count = extra?.keywordCount ?? 0;
  const topKw = extra?.topKeyword ?? "";

  const templates: Record<string, Record<Language, { title: string; body: string; emoji: string }>> = {
    rank_1: {
      ko: { title: `🏆 ${artistName} 트렌드 1위!`, body: `${artistName}이(가) 트렌드 키워드 랭킹 1위를 차지했어요! 지금 가장 화제인 아티스트예요!`, emoji: "🏆" },
      en: { title: `🏆 ${artistName} hits #1!`, body: `${artistName} is now #1 in Trend Rankings! The hottest artist right now!`, emoji: "🏆" },
      ja: { title: `🏆 ${artistName}がトレンド1位に!`, body: `${artistName}がトレンドキーワードランキング1位を獲得！今一番話題のアーティストです！`, emoji: "🏆" },
      zh: { title: `🏆 ${artistName}登顶趋势第一!`, body: `${artistName}在趋势关键词排行榜中夺得第一！现在最火的艺人！`, emoji: "🏆" },
    },
    trend_spike: {
      ko: { title: `🔥 ${artistName} 트렌드 급등!`, body: `${artistName} 관련 트렌드 키워드가 ${count}개 활성화됐어요!${topKw ? ` "${topKw}" 등이 화제예요!` : ""} 지금 확인해보세요!`, emoji: "🔥" },
      en: { title: `🔥 ${artistName} trending!`, body: `${count} trend keywords active for ${artistName}!${topKw ? ` "${topKw}" is trending!` : ""} Check it out!`, emoji: "🔥" },
      ja: { title: `🔥 ${artistName}がトレンド急上昇!`, body: `${artistName}関連のトレンドキーワードが${count}個アクティブ！${topKw ? `「${topKw}」などが話題！` : ""}チェックしてみて！`, emoji: "🔥" },
      zh: { title: `🔥 ${artistName}趋势飙升!`, body: `${artistName}有${count}个趋势关键词活跃！${topKw ? `"${topKw}"等正在热议！` : ""}快来看看！`, emoji: "🔥" },
    },
    milestone: {
      ko: { title: `🎉 ${artistName} 마일스톤 달성!`, body: `${artistName}이(가) 새로운 마일스톤을 달성했어요! 역사적인 순간이에요!`, emoji: "🎉" },
      en: { title: `🎉 ${artistName} milestone!`, body: `${artistName} achieved a new milestone! A historic moment!`, emoji: "🎉" },
      ja: { title: `🎉 ${artistName}マイルストーン達成!`, body: `${artistName}が新しいマイルストーンを達成しました！歴史的な瞬間です！`, emoji: "🎉" },
      zh: { title: `🎉 ${artistName}里程碑!`, body: `${artistName}达成了新的里程碑！历史性的时刻！`, emoji: "🎉" },
    },
  };

  return templates[type]?.[lang] ?? templates[type]?.en ?? { title: "", body: "", emoji: "📢" };
}

// ── Threshold constants ──
const TREND_SPIKE_THRESHOLD = 3; // alert when 3+ active keywords
const ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

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
  const [pendingGroup, setPendingGroup] = useState<GroupedAgentAlert | null>(null);

  const registeredSlots = slots.filter(s => s.wiki_entry_id);
  const wikiEntryIds = registeredSlots.map(s => s.wiki_entry_id!);

  // T2-based: fetch active trend triggers for registered artists
  const { data: trendData } = useQuery({
    queryKey: ["agent-alert-trends", ...wikiEntryIds],
    queryFn: async () => {
      if (wikiEntryIds.length === 0) return [];
      const { data } = await (supabase as any)
        .from("ktrenz_trend_triggers")
        .select("wiki_entry_id, keyword, influence_index, keyword_category")
        .in("wiki_entry_id", wikiEntryIds)
        .eq("status", "active")
        .order("influence_index", { ascending: false });
      return (data ?? []) as any[];
    },
    enabled: !!user?.id && wikiEntryIds.length > 0,
    staleTime: 1000 * 60 * 5,
    refetchInterval: 1000 * 60 * 10,
  });

  // T2-based: check if any artist is rank #1 by keyword count
  const { data: allTrendCounts } = useQuery({
    queryKey: ["agent-alert-rank-check"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("ktrenz_trend_triggers")
        .select("wiki_entry_id")
        .eq("status", "active");
      if (!data) return {};
      const counts: Record<string, number> = {};
      for (const t of data) {
        if (t.wiki_entry_id) {
          counts[t.wiki_entry_id] = (counts[t.wiki_entry_id] || 0) + 1;
        }
      }
      return counts;
    },
    enabled: !!user?.id && wikiEntryIds.length > 0,
    staleTime: 1000 * 60 * 5,
  });

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

  const processAlerts = useCallback(() => {
    if (!user?.id || !trendData || pendingGroup) return;

    const allAlerts: AgentAlert[] = [];

    // Group trend triggers by wiki_entry_id
    const triggersByArtist = new Map<string, any[]>();
    for (const t of trendData) {
      if (!t.wiki_entry_id) continue;
      if (!triggersByArtist.has(t.wiki_entry_id)) triggersByArtist.set(t.wiki_entry_id, []);
      triggersByArtist.get(t.wiki_entry_id)!.push(t);
    }

    // Determine rank #1
    let rank1WikiEntryId: string | null = null;
    if (allTrendCounts) {
      let maxCount = 0;
      for (const [weid, count] of Object.entries(allTrendCounts as Record<string, number>)) {
        if (count > maxCount) {
          maxCount = count;
          rank1WikiEntryId = weid;
        }
      }
    }

    for (const slot of registeredSlots) {
      const weid = slot.wiki_entry_id!;
      const artistName = slot.artist_name ?? "Artist";
      const triggers = triggersByArtist.get(weid) ?? [];

      // Rank #1 alert
      if (rank1WikiEntryId === weid && !isAlertCoolingDown(weid, "rank_1")) {
        const msg = buildAlertMessages("rank_1", artistName, language);
        allAlerts.push({
          id: `rank_1_${weid}`, type: "rank_1", artistName,
          wikiEntryId: weid, ...msg, slot, timestamp: Date.now(),
        });
      }

      // Trend spike alert (3+ active keywords)
      if (triggers.length >= TREND_SPIKE_THRESHOLD && !isAlertCoolingDown(weid, "trend_spike")) {
        const topKeyword = triggers[0]?.keyword ?? "";
        const msg = buildAlertMessages("trend_spike", artistName, language, {
          keywordCount: triggers.length,
          topKeyword,
        });
        allAlerts.push({
          id: `trend_spike_${weid}`, type: "trend_spike", artistName,
          wikiEntryId: weid, ...msg, slot, timestamp: Date.now(),
        });
      }
    }

    // Milestones
    if (milestones) {
      for (const m of milestones) {
        const slot = registeredSlots.find(s => s.wiki_entry_id === m.wiki_entry_id);
        if (!slot) continue;
        const artistName = slot.artist_name ?? "Artist";
        const alertKey = `milestone_${m.event_type}`;
        if (!isAlertCoolingDown(m.wiki_entry_id, alertKey)) {
          const msg = buildAlertMessages("milestone", artistName, language, { milestoneType: m.event_type, milestoneData: m.event_data });
          allAlerts.push({
            id: `${alertKey}_${m.wiki_entry_id}`, type: "milestone", artistName,
            wikiEntryId: m.wiki_entry_id, ...msg, slot, timestamp: Date.now(),
          });
        }
      }
    }

    if (allAlerts.length === 0) return;

    const grouped = new Map<string, GroupedAgentAlert>();
    for (const alert of allAlerts) {
      if (!grouped.has(alert.wikiEntryId)) {
        grouped.set(alert.wikiEntryId, {
          artistName: alert.artistName,
          wikiEntryId: alert.wikiEntryId,
          slot: alert.slot,
          alerts: [],
        });
      }
      grouped.get(alert.wikiEntryId)!.alerts.push(alert);
    }

    const firstGroup = [...grouped.values()][0];
    if (!firstGroup || firstGroup.alerts.length === 0) return;

    for (const alert of firstGroup.alerts) {
      const cooldownKey = alert.id.split(`_${alert.wikiEntryId}`)[0];
      markAlertSent(alert.wikiEntryId, cooldownKey);
      saveAlertToChat(user.id, alert.slot.id, alert.title, alert.body, alert.emoji);

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
    }

    setPendingGroup(firstGroup);
  }, [user?.id, trendData, allTrendCounts, milestones, registeredSlots, language, pendingGroup]);

  useEffect(() => {
    const timer = setTimeout(processAlerts, 3000);
    return () => clearTimeout(timer);
  }, [processAlerts]);

  const dismissAlert = useCallback(() => setPendingGroup(null), []);

  return { pendingGroup, dismissAlert };
}
