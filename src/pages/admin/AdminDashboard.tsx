import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Users, MessageSquare, Database, Search, TrendingUp, TrendingDown, Minus, CheckCircle, Loader2, Clock, AlertTriangle, Rocket } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  naver_news: { label: '네이버뉴스', color: 'bg-green-500/15 text-green-400 border-green-500/30' },
  naver_blog: { label: '블로그/카페', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  instagram: { label: '인스타', color: 'bg-pink-500/15 text-pink-400 border-pink-500/30' },
  tiktok: { label: '틱톡', color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30' },
  youtube: { label: '유튜브', color: 'bg-red-500/15 text-red-400 border-red-500/30' },
  naver_shop: { label: '쇼핑', color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
};

const CATEGORY_LABELS: Record<string, string> = {
  brand: '브랜드', product: '상품', place: '장소', restaurant: '맛집',
  food: '음식', fashion: '패션', beauty: '뷰티', media: '미디어',
  music: '음악', event: '이벤트', social: '소셜', goods: '굿즈',
};

const PHASE_LABELS: Record<string, { label: string; icon: string }> = {
  collect_social: { label: '소셜 수집', icon: '📱' },
  detect: { label: '네이버 감지', icon: '🔍' },
  detect_youtube: { label: '유튜브 감지', icon: '🎬' },
  track: { label: '추적', icon: '📊' },
  settle: { label: '정산', icon: '💰' },
  'schedule-predict': { label: '일정 추론', icon: '📅' },
  'data-auditor': { label: '품질 검사', icon: '🔎' },
};

const formatAge = (dateStr: string): string => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '방금';
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h 전`;
  const days = Math.floor(hours / 24);
  return `${days}d 전`;
};

const formatTime = (dateStr: string): string => {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' });
};

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);

  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const [usersRes, botUsersRes] = await Promise.all([
        supabase.from('ktrenz_user_logins' as any).select('id', { count: 'exact', head: true }),
        supabase.from('ktrenz_fan_agent_messages' as any).select('user_id').limit(1000),
      ]);
      const uniqueBotUsers = new Set((botUsersRes.data || []).map((r: any) => r.user_id)).size;
      return { users: usersRes.count ?? 0, botUsers: uniqueBotUsers };
    },
    staleTime: 1000 * 60 * 5,
  });

  // 파이프라인 상태 (DB 기반 실시간)
  const { data: pipelineRuns } = useQuery({
    queryKey: ['admin-pipeline-state'],
    queryFn: async () => {
      const { data } = await supabase
        .from('ktrenz_pipeline_state' as any)
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(20);

      // run_id별로 그룹핑하여 최신 런의 모든 phase 표시
      const runs = new Map<string, any[]>();
      for (const row of (data || []) as any[]) {
        const runId = row.run_id || 'unknown';
        if (!runs.has(runId)) runs.set(runId, []);
        runs.get(runId)!.push(row);
      }

      // 최신 2개 런만
      const sorted = Array.from(runs.entries())
        .sort((a, b) => {
          const aLatest = Math.max(...a[1].map((r: any) => new Date(r.updated_at).getTime()));
          const bLatest = Math.max(...b[1].map((r: any) => new Date(r.updated_at).getTime()));
          return bLatest - aLatest;
        })
        .slice(0, 2);

      return sorted.map(([runId, phases]) => ({
        runId,
        phases: phases.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
        latestUpdate: phases.reduce((latest: string, p: any) =>
          new Date(p.updated_at) > new Date(latest) ? p.updated_at : latest, phases[0].updated_at),
        isRunning: phases.some((p: any) => p.status === 'running'),
      }));
    },
    refetchInterval: 15000, // 15초마다 갱신
    staleTime: 10000,
  });

  // 소셜 수집 로그
  const { data: socialLogs } = useQuery({
    queryKey: ['admin-social-collection-logs'],
    queryFn: async () => {
      const { data } = await supabase
        .from('ktrenz_collection_log' as any)
        .select('platform, status, records_collected, error_message, collected_at')
        .in('platform', ['instagram', 'tiktok', 'collect_social'])
        .order('collected_at', { ascending: false })
        .limit(10);
      return (data || []) as any[];
    },
    staleTime: 1000 * 60 * 2,
  });

  // 활성 키워드
  const { data: activeKeywords } = useQuery({
    queryKey: ['admin-active-keywords'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ktrenz_trend_triggers' as any)
        .select('id, keyword, keyword_ko, keyword_category, artist_name, trigger_source, influence_index, baseline_score, peak_score, detected_at, status, source_url, source_image_url, prev_api_total, commercial_intent, metadata')
        .in('status', ['active', 'pending'])
        .order('detected_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as any[];
    },
    staleTime: 1000 * 60 * 2,
  });

  // 최근 추적 기록
  const { data: recentTracking } = useQuery({
    queryKey: ['admin-recent-tracking'],
    queryFn: async () => {
      const { data } = await supabase
        .from('ktrenz_trend_tracking' as any)
        .select('trigger_id, interest_score, delta_pct, tracked_at')
        .order('tracked_at', { ascending: false })
        .limit(1000);
      const map = new Map<string, any>();
      for (const r of (data || []) as any[]) {
        if (!map.has(r.trigger_id)) map.set(r.trigger_id, r);
      }
      return map;
    },
    staleTime: 1000 * 60 * 2,
  });

  const totalActive = activeKeywords?.filter(k => k.status === 'active').length ?? 0;
  const totalPending = activeKeywords?.filter(k => k.status === 'pending').length ?? 0;

  // 네이버 키워드의 경우 metadata에서 뉴스/블로그 비중을 파악하여 표시 소스 결정
  const getDisplaySource = (kw: any): string => {
    if (kw.trigger_source !== 'naver_news') return kw.trigger_source || 'unknown';
    const meta = kw.metadata as any;
    const newsTotal = meta?.buzz_news_total ?? 0;
    const blogTotal = meta?.buzz_blog_total ?? 0;
    if (newsTotal === 0 && blogTotal === 0) return 'naver_news';
    return newsTotal >= blogTotal ? 'naver_news' : 'naver_blog';
  };

  const sourceCounts = (activeKeywords || []).reduce((acc: Record<string, number>, k: any) => {
    const src = getDisplaySource(k);
    acc[src] = (acc[src] || 0) + 1;
    return acc;
  }, {});

  const filtered = (activeKeywords || []).filter((k: any) => {
    if (sourceFilter && getDisplaySource(k) !== sourceFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return k.keyword.toLowerCase().includes(q) ||
        (k.keyword_ko || '').toLowerCase().includes(q) ||
        (k.artist_name || '').toLowerCase().includes(q);
    }
    return true;
  });

  const currentRun = pipelineRuns?.[0];
  const prevRun = pipelineRuns?.[1];
  const isAnyRunning = currentRun?.isRunning;

  // 다음 실행 시간 계산 (6시간 간격: 03:30, 09:30, 15:30, 21:30 KST)
  const getNextRunTime = (): string => {
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 3600000);
    const h = kst.getUTCHours();
    const schedules = [3.5, 9.5, 15.5, 21.5]; // 03:30, 09:30, 15:30, 21:30
    const currentH = h + kst.getUTCMinutes() / 60;
    const next = schedules.find(s => s > currentH) || schedules[0] + 24;
    const diff = next - currentH;
    const diffH = Math.floor(diff);
    const diffM = Math.round((diff - diffH) * 60);
    if (diffH === 0) return `${diffM}분 후`;
    return `${diffH}h ${diffM}분 후`;
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">대시보드</h1>

      {/* Pipeline Status Banner */}
      <Card className={cn(
        "border-l-4",
        isAnyRunning ? "border-l-blue-500 bg-blue-500/5" : "border-l-green-500/50"
      )}>
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {isAnyRunning ? (
                <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4 text-green-500" />
              )}
              <span className="text-sm font-semibold">
                {isAnyRunning ? '파이프라인 실행 중' : '파이프라인 대기 중'}
              </span>
              {currentRun && (
                <span className="text-[10px] text-muted-foreground font-mono">
                  {currentRun.runId.replace('run_', '').slice(0, 10)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              {!isAnyRunning && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  다음: {getNextRunTime()}
                </span>
              )}
              {currentRun && (
                <span>갱신: {formatAge(currentRun.latestUpdate)}</span>
              )}
            </div>
          </div>

          {/* Phase progress */}
          {currentRun && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {currentRun.phases.map((phase: any) => {
                const info = PHASE_LABELS[phase.phase] || { label: phase.phase, icon: '⚙️' };
                const progress = phase.total_candidates > 0
                  ? Math.min(100, Math.round((phase.current_offset / phase.total_candidates) * 100))
                  : phase.status === 'done' ? 100 : 0;
                const isDone = phase.status === 'done' || phase.status === 'postprocess_done';
                const isRunning = phase.status === 'running';

                return (
                  <div key={phase.id} className={cn(
                    "rounded-lg px-3 py-2 border",
                    isRunning ? "border-blue-500/30 bg-blue-500/5" :
                    isDone ? "border-border bg-muted/30" :
                    "border-border bg-muted/20"
                  )}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-medium flex items-center gap-1">
                        <span>{info.icon}</span>
                        {info.label}
                      </span>
                      {isRunning ? (
                        <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
                      ) : isDone ? (
                        <CheckCircle className="w-3 h-3 text-green-500" />
                      ) : (
                        <Clock className="w-3 h-3 text-muted-foreground" />
                      )}
                    </div>
                    {/* Progress bar */}
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          isRunning ? "bg-blue-500" : isDone ? "bg-green-500/70" : "bg-muted-foreground/20"
                        )}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-muted-foreground">
                        {phase.current_offset}/{phase.total_candidates}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatTime(phase.updated_at)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Social collection status */}
          {socialLogs && socialLogs.length > 0 && (
            <div className="mt-2 pt-2 border-t border-border/50">
              <div className="flex flex-wrap gap-3 text-[11px]">
                {socialLogs.slice(0, 4).map((log: any, i: number) => (
                  <span key={i} className="flex items-center gap-1 text-muted-foreground">
                    {log.status === 'success' ? (
                      <CheckCircle className="w-3 h-3 text-green-500" />
                    ) : (
                      <AlertTriangle className="w-3 h-3 text-amber-500" />
                    )}
                    <span className="font-medium">{log.platform}</span>
                    {log.records_collected > 0 && <span>({log.records_collected}건)</span>}
                    <span>{formatAge(log.collected_at)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:border-primary/40 transition-colors" onClick={() => navigate('/admin/users')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">총 유저</CardTitle>
            <Users className="w-5 h-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{(stats?.users ?? '-').toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">봇 사용자</CardTitle>
            <MessageSquare className="w-5 h-5 text-purple-500" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{(stats?.botUsers ?? '-').toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/40 transition-colors" onClick={() => navigate('/admin/keyword-monitor')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">활성 키워드</CardTitle>
            <TrendingUp className="w-5 h-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalActive}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">대기 키워드</CardTitle>
            <Database className="w-5 h-5 text-amber-500" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalPending}</p>
          </CardContent>
        </Card>
      </div>

      {/* Active Keywords */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">수집/추적 중인 키워드</CardTitle>
            <span className="text-xs text-muted-foreground">{filtered.length}건</span>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <button
              onClick={() => setSourceFilter(null)}
              className={cn(
                "px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors",
                !sourceFilter ? "bg-primary text-primary-foreground border-primary" : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
              )}
            >
              전체 ({activeKeywords?.length ?? 0})
            </button>
            {Object.entries(sourceCounts).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([src, count]) => {
              const info = SOURCE_LABELS[src] || { label: src, color: 'bg-muted text-muted-foreground border-border' };
              return (
                <button
                  key={src}
                  onClick={() => setSourceFilter(sourceFilter === src ? null : src)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors",
                    sourceFilter === src ? info.color : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                  )}
                >
                  {info.label} ({count as number})
                </button>
              );
            })}
          </div>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="키워드 / 아티스트 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card z-10 border-b border-border">
                <tr className="text-xs text-muted-foreground">
                  <th className="text-left py-2 px-3 font-medium">키워드</th>
                  <th className="text-left py-2 px-2 font-medium hidden sm:table-cell">아티스트</th>
                  <th className="text-center py-2 px-2 font-medium">소스</th>
                  <th className="text-center py-2 px-2 font-medium hidden sm:table-cell">카테고리</th>
                  <th className="text-right py-2 px-2 font-medium">영향력</th>
                  <th className="text-right py-2 px-2 font-medium">변동</th>
                  <th className="text-right py-2 px-3 font-medium hidden sm:table-cell">감지</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((kw: any) => {
                  const tracking = recentTracking?.get(kw.id);
                  const deltaPct = tracking?.delta_pct ?? 0;
                  const influence = Number(kw.influence_index) || 0;
                  const displaySrc = getDisplaySource(kw);
                  const srcInfo = SOURCE_LABELS[displaySrc] || { label: displaySrc, color: 'bg-muted text-muted-foreground border-border' };
                  const catLabel = CATEGORY_LABELS[kw.keyword_category] || kw.keyword_category || '-';
                  const isPending = kw.status === 'pending';
                  const meta = kw.metadata as any;
                  const newsTotal = meta?.buzz_news_total ?? 0;
                  const blogTotal = meta?.buzz_blog_total ?? 0;
                  const showBuzzSplit = kw.trigger_source === 'naver_news' && (newsTotal > 0 || blogTotal > 0);

                  return (
                    <tr
                      key={kw.id}
                      className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => navigate('/admin/keyword-monitor')}
                    >
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          {isPending && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />}
                          <div>
                            <p className="font-medium text-foreground leading-tight">{kw.keyword_ko || kw.keyword}</p>
                            {kw.keyword_ko && kw.keyword !== kw.keyword_ko && (
                              <p className="text-[10px] text-muted-foreground">{kw.keyword}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-muted-foreground hidden sm:table-cell">
                        <span className="text-xs">{kw.artist_name}</span>
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", srcInfo.color)}>
                            {srcInfo.label}
                          </Badge>
                          {showBuzzSplit && (
                            <span className="text-[9px] text-muted-foreground">
                              뉴스{newsTotal} / 블로그{blogTotal}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-center hidden sm:table-cell">
                        <span className="text-xs text-muted-foreground">{catLabel}</span>
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        <span className={cn("text-xs font-semibold", influence > 50 ? "text-primary" : "text-foreground")}>
                          {influence > 0 ? influence.toFixed(0) : '-'}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        {tracking ? (
                          <span className={cn(
                            "inline-flex items-center gap-0.5 text-xs font-medium",
                            deltaPct > 5 ? "text-green-400" : deltaPct < -5 ? "text-red-400" : "text-muted-foreground"
                          )}>
                            {deltaPct > 5 ? <TrendingUp className="w-3 h-3" /> :
                              deltaPct < -5 ? <TrendingDown className="w-3 h-3" /> :
                                <Minus className="w-3 h-3" />}
                            {deltaPct > 0 ? '+' : ''}{deltaPct.toFixed(0)}%
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right hidden sm:table-cell">
                        <span className="text-[11px] text-muted-foreground">{formatAge(kw.detected_at)}</span>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted-foreground text-sm">
                      {search ? '검색 결과가 없습니다' : '활성 키워드가 없습니다'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminDashboard;
