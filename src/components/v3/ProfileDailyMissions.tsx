import React, { useCallback, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { Zap, Eye, Crosshair, Share2, TrendingUp, ChevronRight, Check, PartyPopper } from "lucide-react";
import { Drawer, DrawerContent } from "@/components/ui/drawer";

interface DailyMission {
  key: string;
  icon: React.ReactNode;
  labelKey: string;
  descKey: string;
  points: number;
  exp: number;
  route?: string;
  bonus?: boolean;
  trackEvents: string[];
  threshold: number;
}

const MISSIONS: DailyMission[] = [
  {
    key: "view_trends",
    icon: <Eye className="w-4 h-4" />,
    labelKey: "profileMission.viewTrends",
    descKey: "profileMission.viewTrendsDesc",
    points: 10,
    exp: 5,
    route: "/t2",
    trackEvents: ["t2_treemap_click", "t2_list_click", "t2_detail_open", "t2_keyword_detail_view"],
    threshold: 5,
  },
  {
    key: "follow_keyword",
    icon: <Crosshair className="w-4 h-4" />,
    labelKey: "profileMission.trackKeyword",
    descKey: "profileMission.trackKeywordDesc",
    points: 15,
    exp: 8,
    route: "/t2",
    trackEvents: ["t2_keyword_detail_view"],
    threshold: 1,
  },
  {
    key: "spread_trend",
    icon: <Share2 className="w-4 h-4" />,
    labelKey: "profileMission.spreadTrend",
    descKey: "profileMission.spreadTrendDesc",
    points: 12,
    exp: 6,
    route: "/t2",
    trackEvents: ["t2_share"],
    threshold: 1,
  },
  {
    key: "predict_trend",
    icon: <TrendingUp className="w-4 h-4" />,
    labelKey: "profileMission.predictTrend",
    descKey: "profileMission.predictTrendDesc",
    points: 20,
    exp: 15,
    bonus: true,
    route: "/t2",
    trackEvents: ["trend_bet_placed"],
    threshold: 1,
  },
];

const PROFILE_MISSION_ENTRY = "00000000-0000-0000-0000-000000000000";

interface ProfileDailyMissionsProps {
  onClose: () => void;
}

const ProfileDailyMissions: React.FC<ProfileDailyMissionsProps> = ({ onClose }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const todayStart = `${today}T00:00:00.000Z`;
  const [celebration, setCelebration] = useState<{ label: string; points: number; exp: number } | null>(null);

  // Auto-close celebration after 3s
  useEffect(() => {
    if (!celebration) return;
    const timer = setTimeout(() => setCelebration(null), 3000);
    return () => clearTimeout(timer);
  }, [celebration]);

  const { data: eventCounts = {} } = useQuery({
    queryKey: ["profile-mission-events", user?.id, today],
    queryFn: async () => {
      if (!user?.id) return {};
      const allEventTypes = [...new Set(MISSIONS.flatMap((m) => m.trackEvents))];
      const { data } = await supabase
        .from("ktrenz_user_events" as any)
        .select("event_type")
        .eq("user_id", user.id)
        .gte("created_at", todayStart)
        .in("event_type", allEventTypes);
      const counts: Record<string, number> = {};
      (data || []).forEach((row: any) => {
        counts[row.event_type] = (counts[row.event_type] || 0) + 1;
      });
      return counts;
    },
    enabled: !!user?.id,
    staleTime: 1000 * 30,
  });

  const { data: claimedKeys = [] } = useQuery({
    queryKey: ["profile-mission-claimed", user?.id, today],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from("ktrenz_daily_missions" as any)
        .select("mission_key")
        .eq("user_id", user.id)
        .eq("mission_date", today)
        .eq("wiki_entry_id", PROFILE_MISSION_ENTRY);
      return (data || []).map((d: any) => d.mission_key);
    },
    enabled: !!user?.id,
    staleTime: 1000 * 30,
  });

  const claimedSet = new Set(claimedKeys);

  const isMet = (m: DailyMission): boolean => {
    const total = m.trackEvents.reduce((sum, et) => sum + ((eventCounts as Record<string, number>)[et] || 0), 0);
    return total >= m.threshold;
  };

  const claimReward = useCallback(async (mission: DailyMission) => {
    if (!user?.id) return;
    try {
      const { error } = await supabase.from("ktrenz_daily_missions" as any).insert({
        user_id: user.id,
        wiki_entry_id: PROFILE_MISSION_ENTRY,
        mission_key: mission.key,
        points_awarded: mission.points,
      });
      if (error) {
        if (error.code === "23505") return;
        throw error;
      }
      await supabase.from("ktrenz_point_transactions" as any).insert({
        user_id: user.id,
        amount: mission.points,
        reason: "daily_mission",
        description: `Daily Mission: ${t(mission.labelKey)}`,
      });
      queryClient.invalidateQueries({ queryKey: ["profile-mission-claimed", user.id, today] });
      queryClient.invalidateQueries({ queryKey: ["ktrenz-points", user.id] });
      setCelebration({ label: t(mission.labelKey), points: mission.points, exp: mission.exp });
    } catch (e) {
      console.error("Claim mission error:", e);
    }
  }, [user?.id, today, queryClient, t]);

  const doneCount = MISSIONS.filter((m) => claimedSet.has(m.key)).length;
  const totalMissions = MISSIONS.length;
  const progress = totalMissions > 0 ? (doneCount / totalMissions) * 100 : 0;
  const earnedPoints = MISSIONS.filter((m) => claimedSet.has(m.key)).reduce((s, m) => s + m.points, 0);

  if (!user) return null;

  const handleMission = async (mission: DailyMission) => {
    const met = isMet(mission);
    const claimed = claimedSet.has(mission.key);
    if (met && !claimed) {
      await claimReward(mission);
      return;
    }
    if (!claimed) {
      onClose();
      if (mission.route) navigate(mission.route);
    }
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          <span className="text-xs font-bold text-foreground uppercase tracking-wider">
            {t("profileMission.title")}
          </span>
        </div>
        <span className="text-xs text-muted-foreground font-medium">
          {doneCount}/{totalMissions}
          {earnedPoints > 0 && (
            <span className="ml-1 font-bold text-primary">+{earnedPoints}P</span>
          )}
        </span>
      </div>

      {/* Rainbow progress bar */}
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${progress}%`,
            background: "linear-gradient(90deg, #ef4444, #f97316, #eab308, #22c55e, #3b82f6, #8b5cf6)",
          }}
        />
      </div>

      {/* Mission items */}
      <div className="space-y-1">
        {MISSIONS.map((mission) => {
          const claimed = claimedSet.has(mission.key);
          const met = isMet(mission);
          const readyToClaim = met && !claimed;

          let progressText = "";
          if (!claimed && mission.threshold > 1) {
            const current = mission.trackEvents.reduce(
              (sum, et) => sum + ((eventCounts as Record<string, number>)[et] || 0), 0
            );
            progressText = `${Math.min(current, mission.threshold)}/${mission.threshold}`;
          }

          return (
            <button
              key={mission.key}
              onClick={() => handleMission(mission)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left group",
                claimed
                  ? "bg-muted/50 opacity-60"
                  : readyToClaim
                  ? "bg-primary/10 ring-1 ring-primary/30"
                  : "hover:bg-primary/5 active:scale-[0.98]"
              )}
            >
              <div
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                  claimed
                    ? "bg-muted text-muted-foreground"
                    : readyToClaim
                    ? "bg-muted text-primary"
                    : "bg-muted text-primary"
                )}
              >
                {claimed ? <Check className="w-4 h-4" /> : mission.icon}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className={cn("text-xs font-bold truncate", claimed ? "text-muted-foreground line-through" : "text-foreground")}>
                    {t(mission.labelKey)}
                  </p>
                  {mission.bonus && !claimed && (
                    <span className="text-[9px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full uppercase">
                      {t("profileMission.bonus")}
                    </span>
                  )}
                  {readyToClaim && (
                    <span className="text-[9px] font-bold bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full animate-pulse">
                      {t("profileMission.claim")}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground truncate">
                  {progressText && !claimed ? `${progressText} · ` : ""}{t(mission.descKey)}
                </p>
              </div>

              <div className="text-right shrink-0">
                <p className={cn("text-[10px] font-bold", claimed ? "text-muted-foreground" : "text-primary")}>
                  +{mission.points}P
                </p>
                <p className={cn("text-[9px]", claimed ? "text-muted-foreground" : "text-primary/70")}>
                  +{mission.exp} EXP
                </p>
              </div>

              {!claimed && !readyToClaim && (
                <ChevronRight className="w-3 h-3 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
              )}
            </button>
          );
        })}
      </div>
    </div>

    {/* Celebration modal */}
    <Drawer open={!!celebration} onOpenChange={(open) => !open && setCelebration(null)}>
      <DrawerContent className="bg-background border-border mx-auto md:max-w-sm">
        <div className="flex flex-col items-center gap-3 py-8 px-6 text-center">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
            <PartyPopper className="w-7 h-7 text-primary" />
          </div>
          <p className="text-lg font-bold text-foreground">
            {t("mission.complete")}
          </p>
          <p className="text-sm text-muted-foreground">
            {celebration?.label}
          </p>
          <div className="flex items-center gap-4 mt-1">
            <span className="text-base font-bold text-primary">+{celebration?.points}P</span>
            <span className="text-sm font-semibold text-muted-foreground">+{celebration?.exp} EXP</span>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
    </>
  );
};

export default ProfileDailyMissions;
