import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Users, MessageSquare, Database, Search, TrendingUp, TrendingDown, Minus, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  naver_news: { label: '네이버', color: 'bg-green-500/15 text-green-400 border-green-500/30' },
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

const formatAge = (dateStr: string): string => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return '방금';
  if (hours < 24) return `${hours}h 전`;
  const days = Math.floor(hours / 24);
  return `${days}d 전`;
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

  // 활성 키워드 전체 조회
  const { data: activeKeywords } = useQuery({
    queryKey: ['admin-active-keywords'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ktrenz_trend_triggers' as any)
        .select('id, keyword, keyword_ko, keyword_category, artist_name, trigger_source, influence_index, baseline_score, peak_score, detected_at, status, source_url, source_image_url, prev_api_total, commercial_intent')
        .in('status', ['active', 'pending'])
        .order('detected_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as any[];
    },
    staleTime: 1000 * 60 * 2,
  });

  // 최근 추적 기록 (delta 확인용)
  const { data: recentTracking } = useQuery({
    queryKey: ['admin-recent-tracking'],
    queryFn: async () => {
      const { data } = await supabase
        .from('ktrenz_trend_tracking' as any)
        .select('trigger_id, interest_score, delta_pct, tracked_at')
        .order('tracked_at', { ascending: false })
        .limit(1000);
      // trigger_id별 최신 1건만
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

  // 소스별 카운트
  const sourceCounts = (activeKeywords || []).reduce((acc: Record<string, number>, k: any) => {
    const src = k.trigger_source || 'unknown';
    acc[src] = (acc[src] || 0) + 1;
    return acc;
  }, {});

  // 필터링
  const filtered = (activeKeywords || []).filter((k: any) => {
    if (sourceFilter && k.trigger_source !== sourceFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return k.keyword.toLowerCase().includes(q) ||
        (k.keyword_ko || '').toLowerCase().includes(q) ||
        (k.artist_name || '').toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">대시보드</h1>

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
          {/* Source filter chips */}
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
            {Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]).map(([src, count]) => {
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
                  {info.label} ({count})
                </button>
              );
            })}
          </div>
          {/* Search */}
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
                  const srcInfo = SOURCE_LABELS[kw.trigger_source] || { label: kw.trigger_source || '?', color: 'bg-muted text-muted-foreground border-border' };
                  const catLabel = CATEGORY_LABELS[kw.keyword_category] || kw.keyword_category || '-';
                  const isPending = kw.status === 'pending';

                  return (
                    <tr
                      key={kw.id}
                      className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => navigate(`/admin/keyword-monitor`)}
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
                        <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", srcInfo.color)}>
                          {srcInfo.label}
                        </Badge>
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
