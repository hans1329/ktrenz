import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { Zap, Eye, Crosshair, Share2, TrendingUp, ChevronRight, Check } from "lucide-react";
import { toast } from "sonner";

interface DailyMission {
  key: string;
  icon: React.ReactNode;
  label: string;
  desc: string;
  points: number;
  exp: number;
  route?: string;
  bonus?: boolean;
}

const MISSIONS: (t: (k: string) => string) => DailyMission[] = (t) => [
  {
    key: "view_trends",
    icon: <Eye className="w-4 h-4" />,
    label: "View 5 Trends",
    desc: "Browse today's trending keywords",
    points: 10,
    exp: 5,
    route: "/t2",
  },
  {
    key: "follow_keyword",
    icon: <Crosshair className="w-4 h-4" />,
    label: "Track a Keyword",
    desc: "Follow & track a trending keyword",
    points: 15,
    exp: 8,
    route: "/t2",
  },
  {
    key: "spread_trend",
    icon: <Share2 className="w-4 h-4" />,
    label: "Spread a Trend",
    desc: "Share a trend to amplify it",
    points: 12,
    exp: 6,
    route: "/t2",
  },
  {
    key: "predict_trend",
    icon: <TrendingUp className="w-4 h-4" />,
    label: "Predict a Trend",
    desc: "Place a prediction bet",
    points: 20,
    exp: 15,
    bonus: true,
    route: "/t2",
  },
];

interface ProfileDailyMissionsProps {
  onClose: () => void;
}

const ProfileDailyMissions: React.FC<ProfileDailyMissionsProps> = ({ onClose }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const today = new Date().toISOString().slice(0, 10);

  const { data: completed = [] } = useQuery({
    queryKey: ["profile-daily-missions", user?.id, today],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from("ktrenz_daily_missions" as any)
        .select("mission_key")
        .eq("user_id", user.id)
        .eq("mission_date", today)
        .like("mission_key", "profile_%");
      return (data || []).map((d: any) => d.mission_key);
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60,
  });

  const missions = MISSIONS(t);
  const completedSet = new Set(completed);
  const doneCount = missions.filter((m) => completedSet.has(m.key)).length;
  const totalMissions = missions.length;
  const progress = totalMissions > 0 ? (doneCount / totalMissions) * 100 : 0;
  const totalPoints = missions.filter((m) => completedSet.has(m.key)).reduce((s, m) => s + m.points, 0);

  if (!user) return null;

  const handleMission = (mission: DailyMission) => {
    onClose();
    if (mission.route) navigate(mission.route);
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold text-foreground uppercase tracking-wider">
            Daily Missions
          </span>
        </div>
        <span className="text-xs text-muted-foreground font-medium">
          {doneCount}/{totalMissions}
          {totalPoints > 0 && (
            <span className="ml-1 text-amber-500 font-bold">+{totalPoints}P</span>
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
        {missions.map((mission) => {
          const done = completedSet.has(mission.key);
          return (
            <button
              key={mission.key}
              onClick={() => handleMission(mission)}
              disabled={done}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left group",
                done
                  ? "bg-muted/50 opacity-60"
                  : "hover:bg-primary/5 active:scale-[0.98]"
              )}
            >
              {/* Icon */}
              <div
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                  done ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
                )}
              >
                {done ? <Check className="w-4 h-4" /> : mission.icon}
              </div>

              {/* Label + desc */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className={cn("text-xs font-bold truncate", done ? "text-muted-foreground line-through" : "text-foreground")}>
                    {mission.label}
                  </p>
                  {mission.bonus && !done && (
                    <span className="text-[9px] font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-full uppercase">
                      Bonus
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground truncate">{mission.desc}</p>
              </div>

              {/* Reward */}
              <div className="text-right shrink-0">
                <p className={cn("text-[10px] font-bold", done ? "text-muted-foreground" : "text-amber-500")}>
                  +{mission.points}P
                </p>
                <p className={cn("text-[9px]", done ? "text-muted-foreground" : "text-primary/70")}>
                  +{mission.exp} EXP
                </p>
              </div>

              {!done && (
                <ChevronRight className="w-3 h-3 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ProfileDailyMissions;
