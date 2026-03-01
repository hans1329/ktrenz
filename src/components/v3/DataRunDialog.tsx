import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Youtube, MessageSquare, Music, Disc3, Zap, Lock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

type DataModule = "youtube" | "buzz" | "music" | "album" | "all";

const RainbowProgressBar = () => {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setProgress(prev => prev >= 95 ? 95 : prev + Math.random() * 8);
    }, 300);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="w-full space-y-2 py-3">
      <div className="relative h-2 rounded-full overflow-hidden bg-muted">
        <div className="h-full rounded-full transition-all duration-300 ease-out"
          style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #ff0000, #ff8800, #ffff00, #00cc00, #0088ff, #8800ff, #ff00ff)', backgroundSize: '200% 100%', animation: 'rainbow-slide 1.5s linear infinite' }} />
      </div>
      <p className="text-xs text-muted-foreground text-center animate-pulse">Fetching social data...</p>
      <style>{`@keyframes rainbow-slide { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }`}</style>
    </div>
  );
};

interface ModuleConfig {
  id: DataModule;
  label: string;
  icon: typeof Youtube;
  color: string;
  description: string;
}

const MODULES: ModuleConfig[] = [
  { id: "youtube", label: "YouTube", icon: Youtube, color: "bg-destructive", description: "구독자, 조회수, 최근 영상" },
  { id: "buzz", label: "Buzz", icon: MessageSquare, color: "bg-amber-500", description: "X 멘션, 감성 분석" },
  { id: "music", label: "Music", icon: Music, color: "bg-primary", description: "Last.fm, Deezer, MusicBrainz" },
  { id: "album", label: "Album", icon: Disc3, color: "bg-emerald-500", description: "한터차트 앨범 데이터" },
  { id: "all", label: "전체 수집", icon: Zap, color: "bg-gradient-to-r from-primary to-amber-500", description: "모든 데이터 한번에 수집" },
];

// 티어별 일일 횟수 & 전체수집 허용
const TIER_LIMITS: Record<number, { daily: number; allowAll: boolean; label: string }> = {
  1: { daily: 1, allowAll: false, label: "Free" },
  2: { daily: 5, allowAll: false, label: "Basic" },
  3: { daily: 10, allowAll: true, label: "Pro" },
  4: { daily: 30, allowAll: true, label: "Premium" },
  5: { daily: 999, allowAll: true, label: "VIP" },
};

interface DataRunDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wikiEntryId: string;
  artistTitle: string;
  onRunModule: (module: DataModule) => void;
  isRunning: boolean;
  isCrawling: boolean;
}

export default function DataRunDialog({
  open, onOpenChange, wikiEntryId, artistTitle, onRunModule, isRunning, isCrawling,
}: DataRunDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [runningModule, setRunningModule] = useState<DataModule | null>(null);

  // 유저의 K-Pass 티어
  const { data: userTier } = useQuery({
    queryKey: ["kpass-tier", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("kpass_subscriptions")
        .select("tier_id")
        .eq("user_id", user!.id)
        .eq("status", "active")
        .order("tier_id", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data?.tier_id ?? 1; // default Free
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  // 오늘의 사용량
  const { data: todayUsage, refetch: refetchUsage } = useQuery({
    queryKey: ["data-run-usage", user?.id],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const { count } = await supabase
        .from("ktrenz_data_run_usage" as any)
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("run_date", today);
      return count ?? 0;
    },
    enabled: !!user?.id && open,
  });

  const tier = userTier ?? 1;
  const limits = TIER_LIMITS[tier] || TIER_LIMITS[1];
  const used = todayUsage ?? 0;
  const remaining = Math.max(0, limits.daily - used);

  const canRun = (mod: DataModule) => {
    if (isCrawling || isRunning) return false;
    if (!user) return false;
    if (remaining <= 0) return false;
    if (mod === "all" && !limits.allowAll) return false;
    return true;
  };

  const handleRun = async (mod: DataModule) => {
    if (!canRun(mod)) return;
    
    // 사용량 기록
    await supabase.from("ktrenz_data_run_usage" as any).insert({
      user_id: user!.id,
      wiki_entry_id: wikiEntryId,
      module: mod,
      run_date: new Date().toISOString().split("T")[0],
    } as any);
    
    setRunningModule(mod);
    refetchUsage();
    onRunModule(mod);
    
    // 다이얼로그는 열어두고 진행상황 표시
    toast({ title: `${mod === "all" ? "전체" : MODULES.find(m => m.id === mod)?.label} 데이터 수집 시작`, description: artistTitle });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md w-[calc(100%-2rem)] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            데이터 수집 – {artistTitle}
          </DialogTitle>
        </DialogHeader>

        {/* 잔여 횟수 */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">{limits.label}</Badge>
            <span className="text-xs text-muted-foreground">오늘 잔여</span>
          </div>
          <span className={cn("text-sm font-bold", remaining <= 0 ? "text-destructive" : "text-primary")}>
            {remaining} / {limits.daily === 999 ? "∞" : limits.daily}
          </span>
        </div>

        {/* Rainbow progress bar during collection */}
        {isRunning && runningModule && (
          <RainbowProgressBar />
        )}

        {!user && (
          <p className="text-sm text-muted-foreground text-center py-4">로그인 후 이용할 수 있습니다.</p>
        )}

        {/* 모듈 버튼 그리드 */}
        <div className="grid grid-cols-1 gap-2 mt-2">
          {MODULES.map((mod) => {
            const disabled = !canRun(mod.id);
            const isActive = runningModule === mod.id && isRunning;
            const locked = mod.id === "all" && !limits.allowAll;

            return (
              <button
                key={mod.id}
                disabled={disabled}
                onClick={() => handleRun(mod.id)}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl border transition-all text-left",
                  "hover:bg-accent/50 active:scale-[0.98]",
                  disabled && "opacity-40 cursor-not-allowed hover:bg-transparent",
                  isActive && "ring-2 ring-primary",
                  mod.id === "all" && "border-primary/30 bg-primary/5"
                )}
              >
                <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", mod.color)}>
                  {isActive ? (
                    <Loader2 className="w-4 h-4 text-white animate-spin" />
                  ) : locked ? (
                    <Lock className="w-4 h-4 text-white" />
                  ) : (
                    <mod.icon className="w-4 h-4 text-white" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{mod.label}</p>
                </div>
                {locked && (
                  <Badge variant="outline" className="text-[10px] shrink-0">Pro+</Badge>
                )}
              </button>
            );
          })}
        </div>


        {remaining <= 0 && user && (
          <p className="text-xs text-center text-muted-foreground mt-2">
            오늘 할당량을 모두 사용했습니다. K-Pass 업그레이드로 더 많은 수집이 가능합니다.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
