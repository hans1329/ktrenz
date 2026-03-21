import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Play, Search, ShoppingCart, TrendingUp, TrendingDown, Minus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

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
  latest_score?: number | null;
}

const AdminShoppingKeywords = () => {
  const [search, setSearch] = useState('');
  const [trackingIds, setTrackingIds] = useState<Set<string>>(new Set());

  const { data: triggers, isLoading, refetch } = useQuery({
    queryKey: ['admin-shop-keywords'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ktrenz_trend_triggers')
        .select('id, keyword, keyword_ko, artist_name, baseline_score, peak_score, influence_index, detected_at, status')
        .eq('trigger_source', 'naver_shop')
        .eq('status', 'active')
        .order('detected_at', { ascending: false })
        .limit(500);

      if (error) throw error;

      // Fetch latest tracking scores for these triggers
      if (data && data.length > 0) {
        const ids = data.map(t => t.id);
        const { data: trackingData } = await supabase
          .from('ktrenz_trend_tracking')
          .select('trigger_id, interest_score, tracked_at')
          .in('trigger_id', ids)
          .order('tracked_at', { ascending: false });

        const latestScores = new Map<string, number>();
        for (const t of trackingData || []) {
          if (!latestScores.has(t.trigger_id)) {
            latestScores.set(t.trigger_id, t.interest_score);
          }
        }

        return data.map(t => ({
          ...t,
          latest_score: latestScores.get(t.id) ?? null,
        })) as ShopTrigger[];
      }

      return (data || []) as ShopTrigger[];
    },
  });

  const handleTrackSingle = async (triggerId: string) => {
    setTrackingIds(prev => new Set(prev).add(triggerId));
    try {
      const { data, error } = await supabase.functions.invoke('ktrenz-trend-track', {
        body: { triggerId },
      });
      if (error) throw error;
      toast.success(`추적 완료: score=${data?.results?.[0]?.interest_score ?? '?'}`);
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
        body: { batchSize: 10, batchOffset: 0, shopOnly: true },
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
    tracked: triggers?.filter(t => t.latest_score != null).length ?? 0,
    withScore: triggers?.filter(t => (t.latest_score ?? 0) > 0).length ?? 0,
  };

  const getScoreIcon = (score: number | null) => {
    if (score == null) return <Minus className="w-3 h-3 text-muted-foreground" />;
    if (score >= 50) return <TrendingUp className="w-3 h-3 text-green-500" />;
    if (score > 0) return <TrendingUp className="w-3 h-3 text-yellow-500" />;
    return <TrendingDown className="w-3 h-3 text-muted-foreground" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">쇼핑 키워드 트렌드</h1>
          <p className="text-sm text-muted-foreground mt-1">
            네이버 쇼핑에서 감지된 아티스트 관련 상품/브랜드 키워드의 Google Trends 추적
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
                  <TableHead className="text-center">최신 점수</TableHead>
                  <TableHead className="text-center">Baseline</TableHead>
                  <TableHead className="text-center">Peak</TableHead>
                  <TableHead className="text-center">Influence</TableHead>
                  <TableHead className="text-center">감지일</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      {search ? '검색 결과 없음' : '쇼핑 키워드 없음'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.slice(0, 100).map(t => (
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
                          {getScoreIcon(t.latest_score ?? null)}
                          <span className={`text-sm font-mono ${(t.latest_score ?? 0) > 0 ? 'font-semibold' : 'text-muted-foreground'}`}>
                            {t.latest_score ?? '—'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-sm font-mono text-muted-foreground">
                        {t.baseline_score ?? '—'}
                      </TableCell>
                      <TableCell className="text-center text-sm font-mono text-muted-foreground">
                        {t.peak_score ?? '—'}
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
                        {new Date(t.detected_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
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
                  ))
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
