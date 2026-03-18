import { useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useIsMobile } from "@/hooks/use-mobile";
import SEO from "@/components/SEO";
import V3Header from "@/components/v3/V3Header";
import V3DesktopHeader from "@/components/v3/V3DesktopHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  TrendingUp, ArrowUpRight, ArrowDownRight, Minus, Globe, Clock,
  ExternalLink, Newspaper, Trophy, Info, Timer, Zap, ChevronLeft,
  BarChart3, Target, Activity, Calendar, Building2,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart } from "recharts";

// ── Helpers ──
function getLocalizedKeyword(tile: any, lang: string): string {
  switch (lang) {
    case "ko": return tile.keywordKo || tile.keyword_ko || tile.keyword;
    case "ja": return tile.keywordJa || tile.keyword_ja || tile.keyword;
    case "zh": return tile.keywordZh || tile.keyword_zh || tile.keyword;
    default: return tile.keyword;
  }
}

function getLocalizedContext(tile: any, lang: string): string | null {
  switch (lang) {
    case "ko": return tile.contextKo || tile.context_ko || tile.context;
    case "ja": return tile.contextJa || tile.context_ja || tile.context;
    case "zh": return tile.contextZh || tile.context_zh || tile.context;
    default: return tile.context;
  }
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " +
    d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const CATEGORY_COLORS: Record<string, string> = {
  brand: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  product: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  place: "bg-green-500/10 text-green-400 border-green-500/30",
  food: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  fashion: "bg-pink-500/10 text-pink-400 border-pink-500/30",
  beauty: "bg-rose-500/10 text-rose-400 border-rose-500/30",
  media: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
};

const CATEGORY_LABELS: Record<string, string> = {
  brand: "Brand", product: "Product", place: "Place", food: "Food",
  fashion: "Fashion", beauty: "Beauty", media: "Media",
};

// ── Main Page ──
const T2KeywordDetail = () => {
  const { triggerId } = useParams<{ triggerId: string }>();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isMobile = useIsMobile();

  useEffect(() => {
    document.documentElement.classList.add("v3-theme");
    return () => { document.documentElement.classList.remove("v3-theme"); };
  }, []);

  // Fetch trigger data
  const { data: trigger, isLoading: triggerLoading } = useQuery({
    queryKey: ["t2-trigger-detail", triggerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("ktrenz_trend_triggers" as any)
        .select("*")
        .eq("id", triggerId)
        .single();
      return data as any;
    },
    enabled: !!triggerId,
  });

  // Fetch artist info
  const { data: artistInfo } = useQuery({
    queryKey: ["t2-artist-info", trigger?.wiki_entry_id],
    queryFn: async () => {
      if (!trigger?.wiki_entry_id) return null;
      const [{ data: star }, { data: wiki }] = await Promise.all([
        supabase.from("ktrenz_stars" as any).select("display_name, name_ko").eq("wiki_entry_id", trigger.wiki_entry_id).single(),
        supabase.from("wiki_entries").select("id, image_url").eq("id", trigger.wiki_entry_id).single(),
      ]);
      const s = star as any;
      return { displayName: s?.display_name || trigger.artist_name, nameKo: s?.name_ko, imageUrl: (wiki as any)?.image_url };
    },
    enabled: !!trigger?.wiki_entry_id,
  });

  // Fetch tracking history (all records)
  const { data: trackingHistory } = useQuery({
    queryKey: ["t2-tracking-history", triggerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("ktrenz_trend_tracking" as any)
        .select("*")
        .eq("trigger_id", triggerId)
        .order("tracked_at", { ascending: true })
        .limit(200);
      return (data ?? []) as any[];
    },
    enabled: !!triggerId,
  });

  // Fetch same artist's other keywords
  const { data: relatedKeywords } = useQuery({
    queryKey: ["t2-related-keywords", trigger?.wiki_entry_id, triggerId],
    queryFn: async () => {
      if (!trigger?.wiki_entry_id) return [];
      const { data } = await supabase
        .from("ktrenz_trend_triggers" as any)
        .select("id, keyword, keyword_ko, keyword_category, influence_index, status, detected_at")
        .eq("wiki_entry_id", trigger.wiki_entry_id)
        .neq("id", triggerId)
        .order("influence_index", { ascending: false })
        .limit(10);
      return (data ?? []) as any[];
    },
    enabled: !!trigger?.wiki_entry_id,
  });

  // Chart data
  const chartData = useMemo(() => {
    if (!trackingHistory?.length) return [];
    return trackingHistory.map((t: any) => ({
      time: formatDateTime(t.tracked_at),
      score: t.interest_score ?? 0,
      delta: t.delta_pct ?? 0,
      region: t.region,
    }));
  }, [trackingHistory]);

  const baselineScore = trigger?.baseline_score ?? null;
  const peakScore = trigger?.peak_score ?? null;

  if (triggerLoading) {
    return (
      <div className="min-h-screen">
        {isMobile ? <V3Header /> : <V3DesktopHeader activeTab="rankings" onTabChange={() => {}} />}
        <div className={cn("pt-16 px-4 pb-8", !isMobile && "max-w-4xl mx-auto")}>
          <Skeleton className="h-8 w-48 mb-4" />
          <Skeleton className="h-64 w-full rounded-xl mb-4" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!trigger) {
    return (
      <div className="min-h-screen">
        {isMobile ? <V3Header /> : <V3DesktopHeader activeTab="rankings" onTabChange={() => {}} />}
        <div className={cn("pt-16 px-4 pb-8 text-center", !isMobile && "max-w-4xl mx-auto")}>
          <p className="text-muted-foreground mt-20">Keyword not found.</p>
          <Button variant="outline" onClick={() => navigate("/t2")} className="mt-4">
            <ChevronLeft className="w-4 h-4 mr-1" /> Back to Trend Map
          </Button>
        </div>
      </div>
    );
  }

  const artistName = language === "ko" && artistInfo?.nameKo ? artistInfo.nameKo : (artistInfo?.displayName || trigger.artist_name);
  const keyword = getLocalizedKeyword(trigger, language);
  const context = getLocalizedContext(trigger, language);
  const category = trigger.keyword_category || "brand";
  const influenceIndex = Number(trigger.influence_index) || 0;
  const confidence = Number(trigger.confidence) || 0;
  const elapsedHours = (Date.now() - new Date(trigger.detected_at).getTime()) / 3600000;
  const evidenceImageUrl = trigger.source_image_url || artistInfo?.imageUrl || null;

  return (
    <div className="min-h-screen">
      <SEO
        title={`${trigger.keyword} × ${trigger.artist_name} – T2 Trend Intel`}
        description={`${trigger.keyword} trend driven by ${trigger.artist_name}. Influence Index: +${influenceIndex.toFixed(1)}%`}
        path={`/t2/${triggerId}`}
      />
      {isMobile ? <V3Header /> : <V3DesktopHeader activeTab="rankings" onTabChange={() => {}} />}

      <div className={cn("pt-16 px-4 pb-8", !isMobile && "max-w-4xl mx-auto")}>
        {/* Back */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/t2")}
          className="gap-1 text-xs mb-4 -ml-2"
        >
          <ChevronLeft className="w-4 h-4" /> Trend Map
        </Button>

        {/* Hero Header */}
        <div className="relative rounded-2xl overflow-hidden border border-border mb-6">
          {/* Background */}
          <div
            className="absolute inset-0"
            style={{
              background: artistInfo?.imageUrl
                ? `linear-gradient(to bottom, hsla(220, 30%, 15%, 0.7), hsla(220, 30%, 10%, 0.95)), url(${artistInfo.imageUrl}) center/cover no-repeat`
                : "linear-gradient(135deg, hsl(var(--primary) / 0.15), hsl(var(--muted)))",
            }}
          />
          <div className="relative z-10 p-5 sm:p-8">
            <div className="flex items-start gap-4">
              {artistInfo?.imageUrl && (
                <img
                  src={artistInfo.imageUrl}
                  alt={artistName}
                  className="w-14 h-14 sm:w-18 sm:h-18 rounded-xl object-cover border-2 border-white/20 shadow-lg shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <Badge variant="outline" className={cn("text-[11px]", CATEGORY_COLORS[category])}>
                    {CATEGORY_LABELS[category] || category}
                  </Badge>
                  <Badge variant="outline" className={cn(
                    "text-[10px] font-bold",
                    trigger.status === "active"
                      ? "border-green-500/40 text-green-400 bg-green-500/10"
                      : "border-muted-foreground/30 text-muted-foreground"
                  )}>
                    {trigger.status === "active" ? "Active" : "Expired"}
                  </Badge>
                </div>
                <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight mb-1">
                  {keyword}
                </h1>
                <p className="text-sm text-white/70">
                  <span className="font-medium text-white/90">{artistName}</span>
                  <span className="mx-1.5 text-white/30">·</span>
                  <Clock className="w-3 h-3 inline mr-0.5 text-white/50" />
                  {formatAge(trigger.detected_at)}
                  {trigger.trigger_source && (
                    <>
                      <span className="mx-1.5 text-white/30">·</span>
                      <span className="text-white/50">{trigger.trigger_source === "global_news" ? "Global" : "Naver"}</span>
                    </>
                  )}
                </p>
              </div>
            </div>

            {/* Key metrics row */}
            <div className="grid grid-cols-3 gap-3 mt-5">
              <div className="rounded-xl bg-white/5 backdrop-blur border border-white/10 p-3 text-center">
                <div className="text-[10px] text-white/50 mb-0.5">Influence</div>
                <div className="text-xl font-black text-white">
                  {influenceIndex > 0 ? `+${influenceIndex.toFixed(1)}%` : "—"}
                </div>
              </div>
              <div className="rounded-xl bg-white/5 backdrop-blur border border-white/10 p-3 text-center">
                <div className="text-[10px] text-white/50 mb-0.5">Baseline</div>
                <div className="text-xl font-black text-white">
                  {baselineScore ?? "—"}
                </div>
              </div>
              <div className="rounded-xl bg-white/5 backdrop-blur border border-white/10 p-3 text-center">
                <div className="text-[10px] text-white/50 mb-0.5">Peak</div>
                <div className="text-xl font-black text-white">
                  {peakScore ?? "—"}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Interest Score Chart */}
        {chartData.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 mb-6">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2 mb-4">
              <BarChart3 className="w-4 h-4 text-primary" />
              Google Trends Interest Score
            </h2>
            <div className="h-56 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <defs>
                    <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickLine={false} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  {baselineScore != null && (
                    <ReferenceLine y={baselineScore} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" label={{ value: "Baseline", fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  )}
                  {peakScore != null && (
                    <ReferenceLine y={peakScore} stroke="hsl(var(--destructive))" strokeDasharray="4 4" label={{ value: "Peak", fontSize: 10, fill: "hsl(var(--destructive))" }} />
                  )}
                  <Area
                    type="monotone"
                    dataKey="score"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#scoreGradient)"
                    dot={chartData.length < 30}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div className="grid gap-6 sm:grid-cols-2">
          {/* Evidence: Why this trend? */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            {/* Source thumbnail */}
            {evidenceImageUrl && (
              trigger.source_url ? (
                <a href={trigger.source_url} target="_blank" rel="noopener noreferrer" className="block">
                  <div className="relative aspect-[2/1] w-full overflow-hidden bg-muted">
                    <img src={evidenceImageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                  </div>
                </a>
              ) : (
                <div className="relative aspect-[2/1] w-full overflow-hidden bg-muted">
                  <img src={evidenceImageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                </div>
              )
            )}
            <div className="p-4 space-y-3">
              <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Newspaper className="w-4 h-4 text-primary" />
                Why this trend?
              </h2>
              {context ? (
                <p className="text-sm text-muted-foreground leading-relaxed">{context}</p>
              ) : (
                <p className="text-xs text-muted-foreground italic">No context available yet.</p>
              )}
              {trigger.source_title && (
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/30 border border-border/50">
                  <Newspaper className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    {trigger.source_url ? (
                      <a href={trigger.source_url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-foreground hover:text-primary transition-colors line-clamp-2">
                        {trigger.source_title}
                        <ExternalLink className="w-2.5 h-2.5 inline ml-1 text-muted-foreground" />
                      </a>
                    ) : (
                      <span className="text-xs font-medium text-foreground line-clamp-2">{trigger.source_title}</span>
                    )}
                    {trigger.source_url && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {new URL(trigger.source_url).hostname.replace("www.", "")}
                      </p>
                    )}
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <Target className="w-3 h-3" />
                <span>Confidence: <span className="font-bold text-foreground">{(confidence * 100).toFixed(0)}%</span></span>
              </div>
            </div>
          </div>

          {/* Keyword Lifecycle */}
          <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Timer className="w-4 h-4 text-primary" />
              Keyword Lifecycle
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-muted/30 border border-border p-3">
                <div className="text-[10px] text-muted-foreground mb-1">
                  {trigger.expired_at ? "Lifetime" : "Elapsed"}
                </div>
                <div className="text-lg font-bold text-foreground">
                  {(() => {
                    const h = trigger.lifetime_hours && trigger.lifetime_hours > 0
                      ? trigger.lifetime_hours : elapsedHours;
                    return h >= 24 ? `${(h / 24).toFixed(1)}d` : `${h.toFixed(1)}h`;
                  })()}
                </div>
              </div>
              <div className="rounded-xl bg-muted/30 border border-border p-3">
                <div className="text-[10px] text-muted-foreground mb-1">Time to Peak</div>
                <div className="text-lg font-bold text-foreground flex items-center gap-1">
                  {trigger.peak_at ? (
                    <>
                      <Zap className="w-3.5 h-3.5 text-amber-500" />
                      {(() => {
                        const delay = trigger.peak_delay_hours > 0
                          ? trigger.peak_delay_hours
                          : (new Date(trigger.peak_at).getTime() - new Date(trigger.detected_at).getTime()) / 3600000;
                        return delay >= 24 ? `${(delay / 24).toFixed(1)}d` : `${delay.toFixed(1)}h`;
                      })()}
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">Not peaked yet</span>
                  )}
                </div>
              </div>
              <div className="rounded-xl bg-muted/30 border border-border p-3">
                <div className="text-[10px] text-muted-foreground mb-1">Detected</div>
                <div className="text-xs font-medium text-foreground">{formatDateTime(trigger.detected_at)}</div>
              </div>
              <div className="rounded-xl bg-muted/30 border border-border p-3">
                <div className="text-[10px] text-muted-foreground mb-1">Peak Time</div>
                <div className="text-xs font-medium text-foreground">
                  {trigger.peak_at ? formatDateTime(trigger.peak_at) : "—"}
                </div>
              </div>
            </div>

            {/* Timeline bar */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">0d</span>
              <div className="flex-1 h-2 rounded-full bg-muted/50 overflow-hidden relative">
                {(() => {
                  const maxDays = 14;
                  const h = trigger.lifetime_hours && trigger.lifetime_hours > 0
                    ? trigger.lifetime_hours : elapsedHours;
                  const pct = Math.min(100, (h / (maxDays * 24)) * 100);
                  const peakPct = trigger.peak_at
                    ? Math.min(100, ((new Date(trigger.peak_at).getTime() - new Date(trigger.detected_at).getTime()) / (maxDays * 24 * 3600000)) * 100)
                    : null;
                  return (
                    <>
                      <div className="absolute inset-y-0 left-0 rounded-full bg-primary/60" style={{ width: `${pct}%` }} />
                      {peakPct != null && (
                        <div
                          className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-amber-500 border-2 border-background"
                          style={{ left: `${peakPct}%` }}
                          title="Peak"
                        />
                      )}
                    </>
                  );
                })()}
              </div>
              <span className="text-[10px] text-muted-foreground">14d</span>
            </div>
          </div>
        </div>

        {/* Agency Insight Panel */}
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 mt-6 space-y-4">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" />
            Agency Insight
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-muted/30 border border-border p-4">
              <div className="text-[10px] text-muted-foreground mb-1">Commercial Potential</div>
              <div className="flex items-center gap-2">
                <div className={cn(
                  "text-lg font-black",
                  influenceIndex >= 50 ? "text-green-500" :
                  influenceIndex >= 20 ? "text-amber-500" :
                  influenceIndex > 0 ? "text-orange-500" : "text-muted-foreground"
                )}>
                  {influenceIndex >= 50 ? "High" : influenceIndex >= 20 ? "Medium" : influenceIndex > 0 ? "Low" : "Tracking"}
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {influenceIndex >= 50
                  ? "Strong consumer interest surge. Ideal for brand activation."
                  : influenceIndex >= 20
                  ? "Moderate interest growth. Worth monitoring for partnerships."
                  : influenceIndex > 0
                  ? "Early signal detected. Watch for momentum buildup."
                  : "Waiting for search volume data."}
              </p>
            </div>
            <div className="rounded-xl bg-muted/30 border border-border p-4">
              <div className="text-[10px] text-muted-foreground mb-1">Reaction Speed</div>
              <div className="text-lg font-black text-foreground">
                {trigger.peak_at
                  ? (() => {
                      const delay = (new Date(trigger.peak_at).getTime() - new Date(trigger.detected_at).getTime()) / 3600000;
                      return delay < 6 ? "⚡ Instant" : delay < 24 ? "🔥 Fast" : delay < 72 ? "📈 Gradual" : "🐢 Slow";
                    })()
                  : "⏳ Pending"}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {trigger.peak_at
                  ? `Search interest peaked ${((new Date(trigger.peak_at).getTime() - new Date(trigger.detected_at).getTime()) / 3600000).toFixed(1)}h after news mention.`
                  : "Peak not yet reached. Monitoring in progress."}
              </p>
            </div>
            <div className="rounded-xl bg-muted/30 border border-border p-4">
              <div className="text-[10px] text-muted-foreground mb-1">Detection Source</div>
              <div className="text-lg font-black text-foreground flex items-center gap-1.5">
                {trigger.trigger_source === "global_news" ? (
                  <><Globe className="w-4 h-4 text-blue-400" /> Global</>
                ) : (
                  <><Newspaper className="w-4 h-4 text-green-400" /> Naver</>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {trigger.trigger_source === "global_news"
                  ? "Detected from global media (Soompi, AllKPop, etc.)"
                  : "Detected from Korean news articles on Naver."}
              </p>
            </div>
          </div>
        </div>

        {/* Tracking History Table */}
        {trackingHistory && trackingHistory.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 mt-6">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2 mb-4">
              <Activity className="w-4 h-4 text-primary" />
              Tracking History
              <span className="text-[10px] font-normal text-muted-foreground ml-1">{trackingHistory.length} records</span>
            </h2>
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {[...trackingHistory].reverse().map((t: any) => (
                <div key={t.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-muted/20 border border-border/40">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase w-8">{t.region?.slice(0, 3) || "WW"}</span>
                    <span className="text-sm font-bold text-foreground">{t.interest_score}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-0.5">
                      {(t.delta_pct ?? 0) > 0 ? (
                        <ArrowUpRight className="w-3 h-3 text-green-500" />
                      ) : (t.delta_pct ?? 0) < 0 ? (
                        <ArrowDownRight className="w-3 h-3 text-red-500" />
                      ) : (
                        <Minus className="w-3 h-3 text-muted-foreground" />
                      )}
                      <span className={cn(
                        "text-xs font-medium",
                        (t.delta_pct ?? 0) > 0 ? "text-green-500" :
                        (t.delta_pct ?? 0) < 0 ? "text-red-500" : "text-muted-foreground"
                      )}>
                        {(t.delta_pct ?? 0) > 0 ? "+" : ""}{(t.delta_pct ?? 0).toFixed(1)}%
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground w-20 text-right">
                      {formatDateTime(t.tracked_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Related Keywords from Same Artist */}
        {relatedKeywords && relatedKeywords.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 mt-6">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-primary" />
              Other Keywords by {artistName}
            </h2>
            <div className="flex flex-wrap gap-2">
              {relatedKeywords.map((rk: any) => (
                <button
                  key={rk.id}
                  onClick={() => navigate(`/t2/${rk.id}`)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-xl border transition-all hover:bg-muted/50",
                    rk.status === "active" ? "border-border" : "border-border/40 opacity-60"
                  )}
                >
                  <Badge variant="outline" className={cn("text-[9px] px-1 py-0", CATEGORY_COLORS[rk.keyword_category])}>
                    {(CATEGORY_LABELS[rk.keyword_category] || rk.keyword_category || "").charAt(0)}
                  </Badge>
                  <span className="text-xs font-bold text-foreground">
                    {language === "ko" && rk.keyword_ko ? rk.keyword_ko : rk.keyword}
                  </span>
                  {rk.influence_index > 0 && (
                    <span className="text-[10px] font-bold text-primary">+{Number(rk.influence_index).toFixed(0)}%</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default T2KeywordDetail;
