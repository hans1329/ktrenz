import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Radar, Tag, MessageCircle, Eye, TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

interface AgencySignalRadarPanelProps {
  wikiEntryId: string;
  artistName: string;
}

export default function AgencySignalRadarPanel({ wikiEntryId, artistName }: AgencySignalRadarPanelProps) {
  const cutoff7d = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];

  // Signal-C: Attention
  const { data: attentionData } = useQuery({
    queryKey: ["agency-signal-attention", wikiEntryId],
    queryFn: async () => {
      const { data } = await supabase
        .from("ktrenz_attention_signals" as any)
        .select("*")
        .eq("wiki_entry_id", wikiEntryId)
        .gte("signal_date", cutoff7d)
        .order("signal_date", { ascending: false })
        .limit(7);
      return (data ?? []) as any[];
    },
    enabled: !!wikiEntryId,
    staleTime: 5 * 60_000,
  });

  // Signal-B: Fandom Pulse
  const { data: fandomData } = useQuery({
    queryKey: ["agency-signal-fandom", wikiEntryId],
    queryFn: async () => {
      const { data } = await supabase
        .from("ktrenz_fandom_signals" as any)
        .select("*")
        .eq("wiki_entry_id", wikiEntryId)
        .gte("signal_date", cutoff7d)
        .order("signal_date", { ascending: false })
        .limit(7);
      return (data ?? []) as any[];
    },
    enabled: !!wikiEntryId,
    staleTime: 5 * 60_000,
  });

  // Signal-A: Events
  const { data: eventData } = useQuery({
    queryKey: ["agency-signal-events", wikiEntryId],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
      const { data } = await supabase
        .from("ktrenz_artist_events" as any)
        .select("*, wiki_entry:wiki_entries(title)")
        .eq("wiki_entry_id", wikiEntryId)
        .gte("event_date", cutoff)
        .order("event_date", { ascending: false })
        .limit(10);
      return (data ?? []) as any[];
    },
    enabled: !!wikiEntryId,
    staleTime: 5 * 60_000,
  });

  // Signal confidence from latest prediction
  const { data: signalConfidence } = useQuery({
    queryKey: ["agency-signal-confidence", wikiEntryId],
    queryFn: async () => {
      const { data } = await supabase
        .from("ktrenz_prediction_logs" as any)
        .select("prediction")
        .eq("wiki_entry_id", wikiEntryId)
        .order("predicted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as any)?.prediction?.signal_confidence_factors || null;
    },
    enabled: !!wikiEntryId,
    staleTime: 5 * 60_000,
  });

  const hasAttention = attentionData && attentionData.length > 0;
  const hasFandom = fandomData && fandomData.length > 0;
  const hasEvents = eventData && eventData.length > 0;
  const hasAnyData = hasAttention || hasFandom || hasEvents;

  if (!hasAnyData) return null;

  // Compute attention trends
  const latestAttention = attentionData?.[0];
  const avgDetailViews = hasAttention
    ? Math.round(attentionData!.reduce((s: number, a: any) => s + (a.detail_views || 0), 0) / attentionData!.length)
    : 0;
  const totalTreemapClicks = hasAttention
    ? attentionData!.reduce((s: number, a: any) => s + (a.treemap_clicks || 0), 0)
    : 0;

  // Fandom trends
  const latestFandom = fandomData?.[0];
  const avgSentiment = hasFandom
    ? fandomData!.reduce((s: number, f: any) => s + (Number(f.sentiment_avg) || 0), 0) / fandomData!.length
    : 0;
  const totalIntents = hasFandom
    ? fandomData!.reduce((s: number, f: any) => s + (f.intent_count || 0), 0)
    : 0;

  const EVENT_EMOJI: Record<string, string> = {
    comeback: "🎵", mv_release: "🎬", album_release: "💿", festival: "🎪",
    variety_show: "📺", award_show: "🏆", viral_moment: "🔥", scandal: "⚡", concert_tour: "🎤",
  };

  const IMPACT_LABEL: Record<string, { text: string; cls: string }> = {
    strong: { text: "강함", cls: "text-green-500" },
    moderate: { text: "보통", cls: "text-amber-500" },
    weak: { text: "약함", cls: "text-muted-foreground" },
    no_data: { text: "데이터 없음", cls: "text-muted-foreground/50" },
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Radar className="w-4 h-4 text-primary" />
              Signal Radar 현황
            </CardTitle>
            <CardDescription className="text-xs">
              독점 시그널 데이터 (최근 7일) — {artistName}
            </CardDescription>
          </div>
          {signalConfidence && (
            <div className="flex gap-1.5">
              {(["attention_impact", "fandom_impact", "event_impact"] as const).map((key) => {
                const val = signalConfidence[key];
                const info = IMPACT_LABEL[val] || IMPACT_LABEL.no_data;
                const labels: Record<string, string> = {
                  attention_impact: "관심",
                  fandom_impact: "팬덤",
                  event_impact: "이벤트",
                };
                return (
                  <Badge key={key} variant="outline" className="text-[10px] gap-1">
                    {labels[key]} <span className={info.cls}>{info.text}</span>
                  </Badge>
                );
              })}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Signal-C: Attention */}
          <div className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Eye className="w-3.5 h-3.5 text-primary" />
              Attention Map
            </div>
            {hasAttention ? (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">일 평균 상세 조회</span>
                  <span className="font-medium">{avgDetailViews}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">트리맵 클릭 (7일)</span>
                  <span className="font-medium">{totalTreemapClicks}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">고유 조회 유저</span>
                  <span className="font-medium">{latestAttention?.unique_viewers ?? 0}</span>
                </div>
                {latestAttention?.detail_sections && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {Object.entries(latestAttention.detail_sections as Record<string, number>)
                      .sort(([, a], [, b]) => (b as number) - (a as number))
                      .slice(0, 3)
                      .map(([section, count]) => (
                        <Badge key={section} variant="secondary" className="text-[9px]">
                          {section}: {count as number}
                        </Badge>
                      ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/60">데이터 없음</p>
            )}
          </div>

          {/* Signal-B: Fandom Pulse */}
          <div className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <MessageCircle className="w-3.5 h-3.5 text-primary" />
              Fandom Pulse
            </div>
            {hasFandom ? (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">총 질의 (7일)</span>
                  <span className="font-medium">{totalIntents}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">평균 감정</span>
                  <span className="font-medium flex items-center gap-1">
                    {avgSentiment > 0.3 ? <TrendingUp className="w-3 h-3 text-green-500" /> :
                     avgSentiment < -0.3 ? <TrendingDown className="w-3 h-3 text-red-500" /> :
                     <Minus className="w-3 h-3 text-muted-foreground" />}
                    {avgSentiment.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">고유 유저</span>
                  <span className="font-medium">{latestFandom?.unique_users ?? 0}</span>
                </div>
                {latestFandom?.hot_topics && (latestFandom.hot_topics as string[]).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(latestFandom.hot_topics as string[]).slice(0, 4).map((topic: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-[9px]">
                        {topic}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/60">데이터 없음</p>
            )}
          </div>

          {/* Signal-A: Events */}
          <div className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Tag className="w-3.5 h-3.5 text-primary" />
              Event Labels
            </div>
            {hasEvents ? (
              <div className="space-y-1.5">
                {eventData!.slice(0, 4).map((ev: any, i: number) => {
                  const isActive = new Date(ev.event_date) <= new Date() &&
                    new Date(ev.event_date).getTime() + (ev.impact_window_days || 7) * 86400000 >= Date.now();
                  return (
                    <div key={i} className="flex items-center gap-1.5 text-xs">
                      <span>{EVENT_EMOJI[ev.event_type] || "📌"}</span>
                      <span className="truncate flex-1">{ev.event_title}</span>
                      {isActive ? (
                        <Badge variant="default" className="text-[9px] h-4 shrink-0">진행중</Badge>
                      ) : (
                        <span className="text-muted-foreground text-[10px] shrink-0">
                          {format(new Date(ev.event_date), "MM/dd")}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/60">등록된 이벤트 없음</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
