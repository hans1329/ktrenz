import { useEffect, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import SEO from "@/components/SEO";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  BarChart3, Users, MousePointerClick, Bot, ExternalLink, Eye,
  TrendingUp, Calendar, ArrowLeft, Crown, ChevronLeft
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

// ── 통계 카드 ──
const StatCard = ({ icon: Icon, label, value, sub, color }: {
  icon: any; label: string; value: string | number; sub?: string; color: string;
}) => (
  <Card className="p-4 bg-card border-border">
    <div className="flex items-center gap-3">
      <div className={cn("p-2 rounded-lg", color)}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-black text-foreground">{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  </Card>
);

// ── 인기 아티스트 행 ──
const ArtistRow = ({ rank, name, count }: { rank: number; name: string; count: number }) => (
  <div className="flex items-center gap-3 py-2">
    <span className={cn("w-6 text-center font-black text-sm",
      rank === 1 ? "text-yellow-400" : rank === 2 ? "text-slate-300" : rank === 3 ? "text-amber-600" : "text-muted-foreground"
    )}>
      {rank <= 3 ? <Crown className="w-4 h-4 inline" /> : rank}
    </span>
    <span className="flex-1 text-sm font-semibold text-foreground truncate">{name}</span>
    <span className="text-xs text-muted-foreground font-medium">{count}회</span>
  </div>
);

// ── 활동 타임라인 행 ──
const EVENT_LABELS: Record<string, string> = {
  treemap_click: "에너지맵 클릭",
  list_click: "리스트 클릭",
  modal_category_click: "카테고리 클릭",
  artist_detail_view: "상세 페이지 조회",
  artist_detail_section: "상세 섹션 조회",
  external_link_click: "외부 링크 클릭",
  agent_chat: "에이전트 대화",
  agent_mode_switch: "에이전트 모드 전환",
};

const PLATFORM_COLORS: Record<string, string> = {
  YouTube: "bg-red-500/15 text-red-400",
  X: "bg-foreground/10 text-foreground",
  Reddit: "bg-orange-500/15 text-orange-400",
  TikTok: "bg-pink-500/15 text-pink-400",
  Instagram: "bg-fuchsia-500/15 text-fuchsia-400",
  Spotify: "bg-green-500/15 text-green-400",
  Melon: "bg-emerald-500/15 text-emerald-400",
  Naver: "bg-lime-500/15 text-lime-400",
  other: "bg-muted text-muted-foreground",
};

const TimelineRow = ({ event }: { event: any }) => {
  const data = event.event_data || {};
  const label = EVENT_LABELS[event.event_type] || event.event_type;
  const platform = data.platform as string | undefined;
  const detail = data.artist_name || data.section || data.mode || "";
  const time = new Date(event.created_at);
  const timeStr = `${time.getMonth() + 1}/${time.getDate()} ${time.getHours().toString().padStart(2, "0")}:${time.getMinutes().toString().padStart(2, "0")}`;

  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-border/30 last:border-0">
      <span className="text-[10px] text-muted-foreground w-14 shrink-0">{timeStr}</span>
      <span className="text-xs font-semibold text-foreground">{label}</span>
      {platform && (
        <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full", PLATFORM_COLORS[platform] || PLATFORM_COLORS.other)}>
          {platform}
        </span>
      )}
      {detail && <span className="text-[10px] text-muted-foreground truncate flex-1">{String(detail).substring(0, 30)}</span>}
    </div>
  );
};

const UserDashboard = () => {
  const { user } = useAuth();
  const { isAdmin } = useAdminAuth();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.add("v3-theme");
    return () => { document.documentElement.classList.remove("v3-theme"); };
  }, []);

  const viewUserId = isAdmin && selectedUserId ? selectedUserId : user?.id;

  // ── 유저 이벤트 조회 ──
  const { data: events, isLoading } = useQuery({
    queryKey: ["user-events", viewUserId],
    enabled: !!viewUserId,
    queryFn: async () => {
      const query = supabase
        .from("ktrenz_user_events" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);

      if (!isAdmin || selectedUserId) {
        query.eq("user_id", viewUserId!);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as any[];
    },
    staleTime: 30_000,
  });

  // ── 관리자: DAU 통계 ──
  const { data: dauData } = useQuery({
    queryKey: ["admin-dau"],
    enabled: isAdmin && !selectedUserId,
    queryFn: async () => {
      const days = 14;
      const since = new Date();
      since.setDate(since.getDate() - days);

      const { data } = await supabase
        .from("ktrenz_user_events" as any)
        .select("user_id, created_at")
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false })
        .limit(1000);

      if (!data) return { dailyActive: [], totalUsers: 0 };

      const byDay = new Map<string, Set<string>>();
      for (const e of data as any[]) {
        const day = new Date(e.created_at).toISOString().slice(0, 10);
        if (!byDay.has(day)) byDay.set(day, new Set());
        byDay.get(day)!.add(e.user_id);
      }

      const dailyActive = Array.from(byDay.entries())
        .map(([date, users]) => ({ date, count: users.size }))
        .sort((a, b) => a.date.localeCompare(b.date));

      const totalUsers = new Set((data as any[]).map(e => e.user_id)).size;
      return { dailyActive, totalUsers };
    },
    staleTime: 60_000,
  });

  // ── 관리자: 유저 목록 ──
  const { data: allUsers } = useQuery({
    queryKey: ["admin-event-users"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from("ktrenz_user_events" as any)
        .select("user_id")
        .limit(1000);
      if (!data) return [];
      const counts = new Map<string, number>();
      for (const e of data as any[]) {
        counts.set(e.user_id, (counts.get(e.user_id) || 0) + 1);
      }
      return Array.from(counts.entries())
        .map(([id, count]) => ({ id, count }))
        .sort((a, b) => b.count - a.count);
    },
    staleTime: 60_000,
  });

  // ── 통계 계산 ──
  const stats = useMemo(() => {
    if (!events?.length) return {
      totalEvents: 0, treemapClicks: 0, listClicks: 0,
      detailViews: 0, agentChats: 0, externalClicks: 0,
      topArtists: [] as { name: string; count: number }[],
      externalArtists: [] as { name: string; count: number }[],
      platformBreakdown: [] as { name: string; count: number }[],
    };

    const artistCounts = new Map<string, number>();
    const externalCounts = new Map<string, number>();
    const platformCounts = new Map<string, number>();
    let treemapClicks = 0, listClicks = 0, detailViews = 0, agentChats = 0, externalClicks = 0;

    for (const e of events) {
      const name = (e.event_data as any)?.artist_name;
      if (name) artistCounts.set(name, (artistCounts.get(name) || 0) + 1);

      switch (e.event_type) {
        case "treemap_click": treemapClicks++; break;
        case "list_click": listClicks++; break;
        case "artist_detail_view":
        case "artist_detail_section": detailViews++; break;
        case "agent_chat": agentChats++; break;
        case "external_link_click":
          externalClicks++;
          if (name) externalCounts.set(name, (externalCounts.get(name) || 0) + 1);
          const plat = (e.event_data as any)?.platform || "other";
          platformCounts.set(plat, (platformCounts.get(plat) || 0) + 1);
          break;
      }
    }

    const topArtists = Array.from(artistCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const externalArtists = Array.from(externalCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const platformBreakdown = Array.from(platformCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return { totalEvents: events.length, treemapClicks, listClicks, detailViews, agentChats, externalClicks, topArtists, externalArtists, platformBreakdown };
  }, [events]);

  const recentEvents = (events || []).slice(0, 30);

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <SEO title="나의 활동 – KTrenZ" description="Your activity and analytics" path="/dashboard" />
      {/* Compact header */}
      <header className="sticky top-0 z-50 flex items-center gap-3 h-14 px-4 border-b border-border bg-background/80 backdrop-blur-md shrink-0">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-full hover:bg-muted transition-colors">
          <ChevronLeft className="w-5 h-5 text-muted-foreground" />
        </button>
        <h1 className="text-base font-bold text-foreground">나의 활동</h1>
        {isAdmin && !selectedUserId && (
          <span className="ml-auto text-[10px] text-muted-foreground">Admin</span>
        )}
      </header>
      <main className="flex-1 overflow-auto px-4 pb-8 pt-6 max-w-4xl mx-auto w-full">

        {/* 관리자: 유저 선택 */}
        {isAdmin && (
          <div className="mb-4">
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              <button
                onClick={() => setSelectedUserId(null)}
                className={cn("px-3 py-1.5 rounded-full text-xs font-bold border whitespace-nowrap transition-colors",
                  !selectedUserId ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:bg-muted"
                )}
              >
                전체 통계
              </button>
              {allUsers?.slice(0, 10).map(u => (
                <button
                  key={u.id}
                  onClick={() => setSelectedUserId(u.id)}
                  className={cn("px-3 py-1.5 rounded-full text-xs font-bold border whitespace-nowrap transition-colors",
                    selectedUserId === u.id ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:bg-muted"
                  )}
                >
                  {u.id.slice(0, 8)}… ({u.count})
                </button>
              ))}
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
          </div>
        ) : (
          <>
            {/* 관심 아티스트 태그 클라우드 */}
            {stats.topArtists.length > 0 && (
              <div className="mb-6 mt-2">
                <h3 className="text-sm font-bold text-foreground mb-3">나의 관심 아티스트</h3>
                <div className="flex flex-wrap gap-2">
                  {stats.topArtists.map((artist, idx) => {
                    const maxCount = stats.topArtists[0]?.count || 1;
                    const ratio = artist.count / maxCount;
                    // Scale: font size 12~22px, opacity 60~100%
                    const fontSize = Math.round(12 + ratio * 10);
                    const opacity = 0.6 + ratio * 0.4;
                    const isTop3 = idx < 3;
                    return (
                      <Link
                        key={artist.name}
                        to={`/artist/${encodeURIComponent(artist.name.toLowerCase().replace(/\s+/g, "-"))}`}
                        className={cn(
                          "px-3 py-1.5 rounded-full border transition-all hover:scale-105",
                          isTop3
                            ? "bg-primary/10 border-primary/30 text-primary font-bold"
                            : "bg-muted/50 border-border text-foreground/80 font-medium"
                        )}
                        style={{ fontSize: `${fontSize}px`, opacity }}
                      >
                        {artist.name}
                        <span className="ml-1.5 text-[10px] opacity-60">{artist.count}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 관리자 DAU 차트 */}
            {isAdmin && !selectedUserId && dauData && (
              <Card className="p-4 mb-4 bg-card border-border">
                <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" /> 일별 활성 유저 (최근 14일)
                </h3>
                <div className="flex items-end gap-1 h-20">
                  {dauData.dailyActive.map((d) => {
                    const maxCount = Math.max(...dauData.dailyActive.map(x => x.count), 1);
                    const pct = (d.count / maxCount) * 100;
                    return (
                      <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5">
                        <span className="text-[8px] text-muted-foreground">{d.count}</span>
                        <div className="w-full rounded-t bg-primary/70 transition-all" style={{ height: `${Math.max(pct, 4)}%` }} />
                        <span className="text-[7px] text-muted-foreground">{d.date.slice(5)}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-2">총 {dauData.totalUsers}명 활성 유저</p>
              </Card>
            )}

            {/* 핵심 지표 카드 */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
              <StatCard icon={BarChart3} label="총 이벤트" value={stats.totalEvents} color="bg-primary/10 text-primary" />
              <StatCard icon={MousePointerClick} label="에너지맵 클릭" value={stats.treemapClicks} color="bg-red-500/10 text-red-400" />
              <StatCard icon={TrendingUp} label="리스트 클릭" value={stats.listClicks} color="bg-blue-500/10 text-blue-400" />
              <StatCard icon={Eye} label="상세 페이지" value={stats.detailViews} color="bg-purple-500/10 text-purple-400" />
              <StatCard icon={Bot} label="에이전트 대화" value={stats.agentChats} color="bg-green-500/10 text-green-400" />
              <StatCard icon={ExternalLink} label="외부 링크" value={stats.externalClicks} color="bg-amber-500/10 text-amber-400" />
            </div>

            {/* 인기 아티스트 + 외부 링크 아티스트 */}
            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <Card className="p-4 bg-card border-border">
                <h3 className="text-sm font-bold text-foreground mb-2 flex items-center gap-2">
                  <Crown className="w-4 h-4 text-yellow-400" /> 인기 아티스트 Top 10
                </h3>
                {stats.topArtists.length > 0 ? (
                  stats.topArtists.map((a, i) => (
                    <ArtistRow key={a.name} rank={i + 1} name={a.name} count={a.count} />
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground py-4 text-center">데이터 없음</p>
                )}
              </Card>

              <Card className="p-4 bg-card border-border">
                <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                  <ExternalLink className="w-4 h-4 text-amber-400" /> 외부 링크 클릭
                </h3>
                {/* Platform breakdown */}
                {stats.platformBreakdown.length > 0 ? (
                  <>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {stats.platformBreakdown.map(p => (
                        <span key={p.name} className={cn("text-[11px] font-bold px-2.5 py-1 rounded-full", PLATFORM_COLORS[p.name] || PLATFORM_COLORS.other)}>
                          {p.name} <span className="opacity-60">{p.count}</span>
                        </span>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest mb-2">아티스트별</p>
                    {stats.externalArtists.map((a, i) => (
                      <ArtistRow key={a.name} rank={i + 1} name={a.name} count={a.count} />
                    ))}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground py-4 text-center">데이터 없음</p>
                )}
              </Card>
            </div>

            {/* 활동 타임라인 */}
            <Card className="p-4 bg-card border-border">
              <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" /> 최근 활동 타임라인
              </h3>
              {recentEvents.length > 0 ? (
                recentEvents.map((e: any) => <TimelineRow key={e.id} event={e} />)
              ) : (
                <p className="text-xs text-muted-foreground py-8 text-center">아직 기록된 활동이 없습니다</p>
              )}
            </Card>
          </>
        )}
      </main>
    </div>
  );
};

export default UserDashboard;
