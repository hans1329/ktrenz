import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Play, Search, ShoppingCart, TrendingUp, TrendingDown, Minus, RefreshCw, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';

interface ShopTracking {
  interest_score: number;
  tracked_at: string;
  raw_response: {
    source?: string;
    datalab_ratio?: number;
    datalab_trend_7d?: number[];
    shop_total?: number;
    shop_recent_items?: number;
    composite_score?: number;
  } | null;
}

interface ShopTrigger {
  id: string;
  keyword: string;
  keyword_ko: string | null;
  artist_name: string;
  baseline_score: number | null;
  peak_score: number | null;
  influence_index: number | null;
  detected_at: string;
  status: string;
  latest?: ShopTracking | null;
}

const AdminShoppingKeywords = () => {
  const [search, setSearch] = useState('');
  const [trackingIds, setTrackingIds] = useState<Set<string>>(new Set());

  const { data: triggers, isLoading, refetch } = useQuery({
    queryKey: ['admin-shop-keywords'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ktrenz_trend_triggers')
        .select('id, keyword, keyword_ko, artist_name, baseline_score, peak_score, influence_index, detected_at, status, prev_api_total')
        .eq('trigger_source', 'naver_shop')
        .eq('status', 'active')
        .order('detected_at', { ascending: false })
        .limit(500);

      if (error) throw error;

      if (data && data.length > 0) {
        const ids = data.map(t => t.id);
        const { data: trackingData } = await supabase
          .from('ktrenz_trend_tracking')
          .select('trigger_id, interest_score, tracked_at, raw_response')
          .in('trigger_id', ids)
          .order('tracked_at', { ascending: false });

        const latestMap = new Map<string, ShopTracking>();
        for (const t of trackingData || []) {
          if (!latestMap.has(t.trigger_id)) {
            latestMap.set(t.trigger_id, {
              interest_score: t.interest_score,
              tracked_at: t.tracked_at,
              raw_response: t.raw_response as ShopTracking['raw_response'],
            });
          }
        }

        return data.map(t => {
          const latest = latestMap.get(t.id) ?? null;
          // baseline이 리셋(0)된 상태면 이전 추적 데이터를 무효로 표시
          const isReset = (t.baseline_score ?? 0) === 0 && (t.prev_api_total ?? 0) === 0;
          return {
            ...t,
            latest: isReset ? null : latest,
          } as ShopTrigger;
        });
      }

      return (data || []) as ShopTrigger[];
    },
    staleTime: 0,
    gcTime: 0,
  });

  const handleTrackSingle = async (triggerId: string) => {
    setTrackingIds(prev => new Set(prev).add(triggerId));
    try {
      const { data, error } = await supabase.functions.invoke('ktrenz-trend-track', {
        body: { triggerId },
      });
      if (error) throw error;
      toast.success(`추적 완료: score=${data?.results?.[0]?.buzz_score ?? '?'}`);
      refetch();
    } catch (e: any) {
      toast.error(`추적 실패: ${e.message}`);
    } finally {
      setTrackingIds(prev => {
        const next = new Set(prev);
        next.delete(triggerId);
        return next;
      });
    }
  };

  const handleTrackAll = async () => {
    toast.info('쇼핑 키워드 배치 추적을 시작합니다...');
    try {
      const { data, error } = await supabase.functions.invoke('ktrenz-trend-track', {
        body: { batchSize: 50, batchOffset: 0 },
      });
      if (error) throw error;
      toast.success(`배치 추적 완료: ${data?.tracked ?? 0}건`);
      refetch();
    } catch (e: any) {
      toast.error(`배치 추적 실패: ${e.message}`);
    }
  };

  const filtered = (triggers || []).filter(t => {
    if (!search) return true;
    const q = search.toLowerCase();
    return t.keyword.toLowerCase().includes(q) ||
      (t.keyword_ko || '').toLowerCase().includes(q) ||
      t.artist_name.toLowerCase().includes(q);
  });

  const stats = {
    total: triggers?.length ?? 0,
    tracked: triggers?.filter(t => t.latest != null).length ?? 0,
    withScore: triggers?.filter(t => (t.latest?.interest_score ?? 0) > 0).length ?? 0,
  };

  const getScoreIcon = (score: number | null | undefined) => {
    if (score == null) return <Minus className="w-3 h-3 text-muted-foreground" />;
    if (score >= 50) return <TrendingUp className="w-3 h-3 text-green-500" />;
    if (score > 0) return <TrendingUp className="w-3 h-3 text-yellow-500" />;
    return <TrendingDown className="w-3 h-3 text-muted-foreground" />;
  };

  const MiniSparkline = ({ data }: { data?: number[] }) => {
    if (!data || data.length < 2) return <span className="text-[10px] text-muted-foreground">—</span>;
    const max = Math.max(...data, 1);
    const h = 16;
    const w = 40;
    const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h}`).join(' ');
    return (
      <svg width={w} height={h} className="inline-block">
        <polyline points={points} fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" />
      </svg>
    );
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = Date.now();
    const diffM = Math.round((now - d.getTime()) / 60000);
    if (diffM < 60) return `${diffM}분 전`;
    if (diffM < 1440) return `${Math.round(diffM / 60)}시간 전`;
    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">쇼핑 키워드 트렌드</h1>
          <p className="text-sm text-muted-foreground mt-1">
            네이버 데이터랩 검색량 + 쇼핑 상품수 복합 추적
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-1" /> 새로고침
          </Button>
          <Button size="sm" onClick={handleTrackAll}>
            <Play className="w-4 h-4 mr-1" /> 전체 추적 실행
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground">전체 쇼핑 키워드</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold">{stats.tracked}</div>
            <div className="text-xs text-muted-foreground">추적 완료</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-green-500">{stats.withScore}</div>
            <div className="text-xs text-muted-foreground">검색량 있음 (score &gt; 0)</div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="키워드 또는 아티스트 검색..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>아티스트</TableHead>
                  <TableHead>키워드</TableHead>
                  <TableHead className="text-center">복합 점수</TableHead>
                  <TableHead className="text-center">검색 트렌드</TableHead>
                  <TableHead className="text-center">상품수</TableHead>
                  <TableHead className="text-center">7일 추이</TableHead>
                  <TableHead className="text-center">Influence</TableHead>
                  <TableHead className="text-center">추적 시간</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      {search ? '검색 결과 없음' : '쇼핑 키워드 없음'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.slice(0, 100).map(t => {
                    const raw = t.latest?.raw_response;
                    const datalabRatio = raw?.datalab_ratio;
                    const shopTotal = raw?.shop_total;
                    const trend7d = raw?.datalab_trend_7d;
                    const score = t.latest?.interest_score;

                    return (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium text-sm">{t.artist_name}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <ShoppingCart className="w-3 h-3 text-muted-foreground" />
                            <span className="text-sm">{t.keyword_ko || t.keyword}</span>
                            {t.keyword_ko && t.keyword !== t.keyword_ko && (
                              <span className="text-xs text-muted-foreground">({t.keyword})</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            {getScoreIcon(score)}
                            <span className={`text-sm font-mono ${(score ?? 0) > 0 ? 'font-semibold' : 'text-muted-foreground'}`}>
                              {score ?? '—'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {datalabRatio != null ? (
                            <div className="flex items-center justify-center gap-1">
                              <BarChart3 className="w-3 h-3 text-blue-500" />
                              <span className="text-sm font-mono">{datalabRatio}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {shopTotal != null ? (
                            <span className="text-sm font-mono text-muted-foreground">
                              {shopTotal >= 1000 ? `${(shopTotal / 1000).toFixed(1)}k` : shopTotal}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <MiniSparkline data={trend7d} />
                        </TableCell>
                        <TableCell className="text-center">
                          {t.influence_index != null && t.influence_index > 0 ? (
                            <Badge variant="secondary" className="text-xs font-mono">
                              +{t.influence_index}%
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center text-xs text-muted-foreground">
                          {t.latest?.tracked_at ? formatTime(t.latest.tracked_at) : '미추적'}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleTrackSingle(t.id)}
                            disabled={trackingIds.has(t.id)}
                          >
                            {trackingIds.has(t.id) ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Play className="w-3 h-3" />
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
          {filtered.length > 100 && (
            <div className="text-center py-3 text-xs text-muted-foreground border-t">
              {filtered.length}건 중 상위 100건 표시
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminShoppingKeywords;
