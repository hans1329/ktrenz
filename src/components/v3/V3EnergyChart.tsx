import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Flame, Zap, Activity, TrendingUp, ChevronUp, ChevronDown } from "lucide-react";
import { Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart, ReferenceLine } from "recharts";

const getEnergyLevel = (score: number) => {
  if (score >= 300) return { icon: "🔥", label: "Explosive", color: "text-red-500", bg: "bg-red-500/10" };
  if (score >= 150) return { icon: "⚡", label: "Active", color: "text-amber-500", bg: "bg-amber-500/10" };
  if (score >= 100) return { icon: "💫", label: "Normal", color: "text-blue-400", bg: "bg-blue-400/10" };
  return { icon: "💤", label: "Low", color: "text-muted-foreground", bg: "bg-muted" };
};

const ChangeChip = ({ value, label }: { value: number; label: string }) => {
  const isUp = value > 0;
  const isNeutral = value === 0;
  return (
    <div className={cn("flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold",
      isNeutral ? "bg-muted text-muted-foreground" : isUp ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500")}>
      {!isNeutral && (isUp ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
      {isNeutral ? "—" : `${isUp ? "+" : ""}${value.toFixed(1)}%`}
      <span className="text-muted-foreground font-normal ml-0.5">{label}</span>
    </div>
  );
};

const EnergyGauge = ({ score, maxScore = 500 }: { score: number; maxScore?: number }) => {
  const pct = Math.min(score / maxScore, 1);
  const angle = pct * 180;
  const level = getEnergyLevel(score);

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-40 h-20 overflow-hidden">
        <svg viewBox="0 0 200 100" className="w-full h-full">
          <path d="M 10 100 A 90 90 0 0 1 190 100" fill="none" stroke="hsl(var(--muted))" strokeWidth="12" strokeLinecap="round" />
          <path d="M 10 100 A 90 90 0 0 1 190 100" fill="none" stroke="url(#energyGradient)" strokeWidth="12" strokeLinecap="round"
            strokeDasharray={`${angle * Math.PI * 90 / 180} 999`} />
          <defs>
            <linearGradient id="energyGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#c13400" /><stop offset="50%" stopColor="#e04a1a" /><stop offset="100%" stopColor="#ff6b3d" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-0">
          <span className="text-2xl font-black text-foreground">{score}</span>
        </div>
      </div>
      <div className={cn("flex items-center gap-1 mt-1 px-3 py-1 rounded-full", level.bg)}>
        <span className="text-sm">{level.icon}</span>
        <span className={cn("text-xs font-bold", level.color)}>{level.label}</span>
      </div>
    </div>
  );
};

const ComponentBars = ({ velocity, intensity }: { velocity: number; intensity: number }) => {
  const velMax = 250;
  const intMax = 250;
  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground"><Zap className="w-3 h-3 text-amber-500" /> Velocity</span>
          <span className="text-xs font-bold text-foreground">{velocity}</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-700" style={{ width: `${Math.min((velocity / velMax) * 100, 100)}%` }} />
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5">Response speed vs average</p>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground"><Activity className="w-3 h-3 text-teal-400" /> Intensity</span>
          <span className="text-xs font-bold text-foreground">{intensity}</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-teal-400 to-cyan-500 transition-all duration-700" style={{ width: `${Math.min((intensity / intMax) * 100, 100)}%` }} />
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5">Engagement depth vs average</p>
      </div>
    </div>
  );
};

const ChartTooltipContent = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-2 shadow-lg text-xs">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p: any) => <p key={p.name} className="font-semibold" style={{ color: p.color }}>{p.name}: {Math.round(p.value)}</p>)}
    </div>
  );
};

interface V3EnergyChartProps { wikiEntryId: string; }

const V3EnergyChart = ({ wikiEntryId }: V3EnergyChartProps) => {
  const { data, isLoading } = useQuery({
    queryKey: ["v3-energy", wikiEntryId],
    queryFn: async () => {
      const [snapshotsRes, baselineRes, scoresRes, latestSnapshotRes] = await Promise.all([
        supabase.from("v3_energy_snapshots").select("snapshot_at, velocity_score, intensity_score, energy_score").eq("wiki_entry_id", wikiEntryId).order("snapshot_at", { ascending: true }).limit(100),
        supabase.from("v3_energy_baselines").select("*").eq("wiki_entry_id", wikiEntryId).maybeSingle(),
        supabase.from("v3_scores").select("energy_score, energy_change_24h, energy_rank").eq("wiki_entry_id", wikiEntryId).order("scored_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("v3_energy_snapshots").select("velocity_score, intensity_score").eq("wiki_entry_id", wikiEntryId).order("snapshot_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      return { snapshots: snapshotsRes.data || [], baseline: baselineRes.data, currentScore: scoresRes.data, latestSnapshot: latestSnapshotRes.data };
    },
    enabled: !!wikiEntryId,
    staleTime: 60_000,
  });

  if (isLoading) return <Skeleton className="h-64 w-full rounded-2xl" />;

  const { snapshots, currentScore, latestSnapshot: latestSnap } = data || {};
  if (!snapshots?.length && !currentScore?.energy_score) return null;

  const lastFromHistory = snapshots?.[snapshots.length - 1];
  const energyScore = lastFromHistory?.energy_score || currentScore?.energy_score || 100;
  const velocity = lastFromHistory?.velocity_score || latestSnap?.velocity_score || 100;
  const intensity = lastFromHistory?.intensity_score || latestSnap?.intensity_score || 100;
  const change24h = currentScore?.energy_change_24h || 0;

  const chartData = (snapshots || []).map((s: any) => ({
    time: new Date(s.snapshot_at).toLocaleDateString("en", { month: "short", day: "numeric", hour: "2-digit" }),
    Energy: Number(s.energy_score), Velocity: Number(s.velocity_score), Intensity: Number(s.intensity_score),
  }));

  return (
    <div className="space-y-4 -mx-4 px-4">
      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[10px] text-primary font-semibold uppercase tracking-widest flex items-center gap-1">
          <Flame className="w-3 h-3 text-primary" /> Fan Energy Score
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <Card className="p-5 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 border-primary/15 rounded-none sm:rounded-xl border-x-0 sm:border-x">
        <div className="flex flex-col items-center gap-3">
          <EnergyGauge score={Number(energyScore)} />
          <div className="flex items-center gap-2">
            <ChangeChip value={Number(change24h)} label="24h" />
            {currentScore?.energy_rank && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-muted text-[10px] font-bold text-muted-foreground">#{currentScore.energy_rank} rank</div>
            )}
          </div>
        </div>
      </Card>

      <Card className="p-4 bg-card rounded-none sm:rounded-xl border-x-0 sm:border-x">
        <ComponentBars velocity={Number(velocity)} intensity={Number(intensity)} />
      </Card>

      {chartData.length >= 2 && (
        <Card className="p-4 bg-card rounded-none sm:rounded-xl border-x-0 sm:border-x">
          <h4 className="text-xs font-bold text-foreground mb-3 flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3 text-primary" /> FES Trend
          </h4>
          <div className="h-56 -mx-6 sm:-mx-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ left: -10, right: 4, top: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="fesGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} /><stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip content={<ChartTooltipContent />} />
                <ReferenceLine y={100} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" label={{ value: "Avg", fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Area type="monotone" dataKey="Energy" stroke="hsl(var(--primary))" fill="url(#fesGradient)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Velocity" stroke="#f59e0b" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                <Line type="monotone" dataKey="Intensity" stroke="#2dd4bf" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-center gap-4 mt-2">
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><span className="w-3 h-0.5 rounded bg-primary inline-block" /> Energy</span>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><span className="w-3 h-0.5 rounded bg-amber-500 inline-block" /> Velocity</span>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><span className="w-3 h-0.5 rounded bg-teal-400 inline-block" /> Intensity</span>
          </div>
        </Card>
      )}
    </div>
  );
};

export default V3EnergyChart;
