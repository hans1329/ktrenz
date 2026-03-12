import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  Play,
  Filter,
  RefreshCw,
  Search,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

type Severity = 'critical' | 'high' | 'medium' | 'low';

type AuditSummary = {
  artists_checked: number;
  issues_found: number;
  total_artists?: number;
  offset?: number;
  limit?: number;
};

const SEVERITY_CONFIG: Record<Severity, { color: string; icon: typeof XCircle; label: string }> = {
  critical: { color: 'text-red-500', icon: XCircle, label: 'Critical' },
  high: { color: 'text-orange-500', icon: AlertTriangle, label: 'High' },
  medium: { color: 'text-amber-500', icon: AlertTriangle, label: 'Medium' },
  low: { color: 'text-blue-500', icon: AlertTriangle, label: 'Low' },
};

const ISSUE_TYPE_LABELS: Record<string, string> = {
  missing_source: '소스 누락',
  zero_score: '0점 이상',
  stale_data: '수집 지연',
  new_collection_spike: '초기 수집 급증',
  unit_mismatch: '단위 불일치',
  value_anomaly: '값 이상',
  wrong_identifier: '식별자 불일치',
};

const AdminDataQuality = () => {
  const queryClient = useQueryClient();
  const [severityFilter, setSeverityFilter] = useState<Severity | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [showResolved, setShowResolved] = useState(false);
  const [idAuditProgress, setIdAuditProgress] = useState<{ done: number; total: number } | null>(null);
  const [resolveProgress, setResolveProgress] = useState<{ done: number; total: number } | null>(null);

  const {
    data: issues,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['data-quality-issues', showResolved],
    queryFn: async () => {
      let q = supabase
        .from('ktrenz_data_quality_issues' as any)
        .select('*')
        .order('detected_at', { ascending: false });

      if (!showResolved) {
        q = q.eq('resolved', false);
      }

      const { data, error } = await q.limit(500);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 30_000,
  });

  const runAudit = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('ktrenz-data-auditor', {
        body: { mode: 'full' },
      });
      if (error) throw error;
      return (typeof data === 'string' ? JSON.parse(data) : data) as AuditSummary;
    },
    onSuccess: (data) => {
      toast.success(`감사 완료: ${data.issues_found}건 이슈 발견 (${data.artists_checked}명 검사)`);
      queryClient.invalidateQueries({ queryKey: ['data-quality-issues'] });
    },
    onError: (err) => {
      toast.error(`감사 실패: ${(err as Error).message}`);
    },
  });

  const runIdentifierAudit = useMutation({
    mutationFn: async () => {
      const { count, error: countError } = await supabase
        .from('v3_artist_tiers' as any)
        .select('wiki_entry_id', { count: 'exact', head: true })
        .eq('tier', 1);

      if (countError) throw countError;

      const total = count ?? 0;
      const batchSize = 20;
      let processed = 0;
      let totalIssues = 0;

      setIdAuditProgress({ done: 0, total });

      for (let offset = 0; offset < total; offset += batchSize) {
        const { data, error } = await supabase.functions.invoke('ktrenz-data-auditor', {
          body: { mode: 'id_only', offset, limit: batchSize },
        });
        if (error) throw error;

        const parsed = (typeof data === 'string' ? JSON.parse(data) : data) as AuditSummary;
        processed += parsed.artists_checked ?? 0;
        totalIssues += parsed.issues_found ?? 0;
        setIdAuditProgress({ done: processed, total });
      }

      return { processed, totalIssues, total };
    },
    onSuccess: (result) => {
      toast.success(`ID 정합성 감사 완료: ${result.totalIssues}건 이슈 (${result.processed}/${result.total}명)`);
      queryClient.invalidateQueries({ queryKey: ['data-quality-issues'] });
    },
    onError: (err) => {
      toast.error(`ID 정합성 감사 실패: ${(err as Error).message}`);
    },
    onSettled: () => {
      setIdAuditProgress(null);
    },
  });

  const resolveIssue = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const { error } = await supabase
        .from('ktrenz_data_quality_issues' as any)
        .update({
          resolved: true,
          resolved_at: new Date().toISOString(),
          resolution_note: note,
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('이슈 확인 처리됨 (원인 미해결 시 재감사에서 재오픈)');
      queryClient.invalidateQueries({ queryKey: ['data-quality-issues'] });
    },
    onError: (err) => {
      toast.error(`해결 처리 실패: ${(err as Error).message}`);
    },
  });

  const resolveAllFiltered = useMutation({
    mutationFn: async () => {
      const unresolvedIds = filtered.filter((i: any) => !i.resolved).map((i: any) => i.id);
      if (unresolvedIds.length === 0) throw new Error('해결할 이슈가 없습니다');

      const total = unresolvedIds.length;
      const batchSize = 50;
      let done = 0;
      setResolveProgress({ done: 0, total });

      for (let i = 0; i < unresolvedIds.length; i += batchSize) {
        const batch = unresolvedIds.slice(i, i + batchSize);
        const { error } = await supabase
          .from('ktrenz_data_quality_issues' as any)
          .update({
            resolved: true,
            resolved_at: new Date().toISOString(),
            resolution_note: '일괄 해결',
          })
          .in('id', batch);
        if (error) throw error;
        done += batch.length;
        setResolveProgress({ done, total });
      }
      return total;
    },
    onSuccess: (count) => {
      toast.success(`${count}건 확인 처리 완료 (원인 미해결 시 재감사에서 재오픈)`);
      queryClient.invalidateQueries({ queryKey: ['data-quality-issues'] });
    },
    onError: (err) => {
      toast.error(`일괄 해결 실패: ${(err as Error).message}`);
    },
    onSettled: () => {
      setResolveProgress(null);
    },
  });

  const filtered = (issues ?? []).filter((i: any) => {
    if (severityFilter !== 'all' && i.severity !== severityFilter) return false;
    if (typeFilter !== 'all' && i.issue_type !== typeFilter) return false;
    return true;
  });

  const summary = {
    critical: (issues ?? []).filter((i: any) => i.severity === 'critical' && !i.resolved).length,
    high: (issues ?? []).filter((i: any) => i.severity === 'high' && !i.resolved).length,
    medium: (issues ?? []).filter((i: any) => i.severity === 'medium' && !i.resolved).length,
    low: (issues ?? []).filter((i: any) => i.severity === 'low' && !i.resolved).length,
  };
  const totalOpen = summary.critical + summary.high + summary.medium + summary.low;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-bold flex items-center gap-2"><ShieldAlert className="w-5 h-5" /> 데이터 품질 감시</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="p-4 border-destructive/30 bg-destructive/5">
        <div className="flex items-center gap-2 text-destructive text-sm font-semibold">
          <ShieldAlert className="w-4 h-4" /> 데이터 조회 실패
        </div>
        <p className="text-xs text-muted-foreground mt-1">{(error as Error)?.message ?? '알 수 없는 오류'}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-primary" /> 데이터 품질 감시
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Tier 1 아티스트 데이터 수집 이상 탐지 · 자동 감사 · 수동 해결
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => runIdentifierAudit.mutate()}
            disabled={runIdentifierAudit.isPending || runAudit.isPending}
            size="sm"
            variant="outline"
            className="gap-2"
          >
            {runIdentifierAudit.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            ID 정합성 감사
          </Button>
          <Button
            onClick={() => runAudit.mutate()}
            disabled={runAudit.isPending || runIdentifierAudit.isPending}
            size="sm"
            className="gap-2"
          >
            {runAudit.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            일반 감사
          </Button>
        </div>
      </div>

      {idAuditProgress && (
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">
            ID 정합성 감사 진행중: <span className="font-semibold text-foreground">{idAuditProgress.done}</span> / {idAuditProgress.total}
          </p>
        </Card>
      )}

      {resolveProgress && (
        <Card className="p-3">
          <div className="flex items-center gap-3">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">
                일괄 해결 진행중: <span className="font-semibold text-foreground">{resolveProgress.done}</span> / {resolveProgress.total}
              </p>
              <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${(resolveProgress.done / resolveProgress.total) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="p-4">
          <p className="text-2xl font-bold text-foreground">{totalOpen}</p>
        </Card>
        {(['critical', 'high', 'medium', 'low'] as Severity[]).map((sev) => {
          const cfg = SEVERITY_CONFIG[sev];
          const Icon = cfg.icon;
          return (
            <Card key={sev} className="p-4 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setSeverityFilter(sev === severityFilter ? 'all' : sev)}>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Icon className={`w-3 h-3 ${cfg.color}`} /> {cfg.label}
              </p>
              <p className={`text-2xl font-bold ${cfg.color}`}>{summary[sev]}</p>
            </Card>
          );
        })}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <Badge
          variant={typeFilter === 'all' ? 'default' : 'outline'}
          className="cursor-pointer text-xs"
          onClick={() => setTypeFilter('all')}
        >
          전체 유형
        </Badge>
        {Object.entries(ISSUE_TYPE_LABELS).map(([key, label]) => (
          <Badge
            key={key}
            variant={typeFilter === key ? 'default' : 'outline'}
            className="cursor-pointer text-xs"
            onClick={() => setTypeFilter(key === typeFilter ? 'all' : key)}
          >
            {label}
          </Badge>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <Badge
            variant={showResolved ? 'default' : 'outline'}
            className="cursor-pointer text-xs"
            onClick={() => setShowResolved(!showResolved)}
          >
            {showResolved ? '해결 포함' : '미해결만'}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['data-quality-issues'] })}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">
            이슈 목록 ({filtered.length}건)
          </CardTitle>
          {filtered.filter((i: any) => !i.resolved).length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              disabled={resolveAllFiltered.isPending}
              onClick={() => resolveAllFiltered.mutate()}
            >
              {resolveAllFiltered.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              전체 해결 ({filtered.filter((i: any) => !i.resolved).length}건)
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs w-16">심각도</TableHead>
                  <TableHead className="text-xs w-28">아티스트</TableHead>
                  <TableHead className="text-xs w-24">유형</TableHead>
                  <TableHead className="text-xs w-24">플랫폼</TableHead>
                  <TableHead className="text-xs">설명</TableHead>
                  <TableHead className="text-xs w-20">기대값</TableHead>
                  <TableHead className="text-xs w-20">실제값</TableHead>
                  <TableHead className="text-xs w-24">감지 시간</TableHead>
                  <TableHead className="text-xs w-20">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">
                      {totalOpen === 0 ? (
                        <span className="flex items-center justify-center gap-2">
                          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                          모든 데이터 소스가 정상입니다
                        </span>
                      ) : '필터에 해당하는 이슈가 없습니다'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((issue: any) => {
                    const sev = SEVERITY_CONFIG[issue.severity as Severity] ?? SEVERITY_CONFIG.medium;
                    const SevIcon = sev.icon;
                    return (
                      <TableRow key={issue.id} className={issue.resolved ? 'opacity-50' : ''}>
                        <TableCell>
                          <span className={`flex items-center gap-1 text-xs ${sev.color}`}>
                            <SevIcon className="w-3.5 h-3.5" />
                            {sev.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs font-medium">{issue.artist_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {ISSUE_TYPE_LABELS[issue.issue_type] ?? issue.issue_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{issue.platform}</TableCell>
                        <TableCell className="text-xs max-w-[300px] truncate" title={issue.description}>
                          {issue.description}
                        </TableCell>
                        <TableCell className="text-xs text-emerald-500">{issue.expected_value}</TableCell>
                        <TableCell className="text-xs text-red-500">{issue.actual_value}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(issue.detected_at), { addSuffix: true })}
                        </TableCell>
                        <TableCell>
                          {!issue.resolved ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs h-7"
                              onClick={() => resolveIssue.mutate({ id: issue.id, note: '수동 해결' })}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> 해결
                            </Button>
                          ) : (
                            <span className="text-[10px] text-emerald-500">✓ 해결됨</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminDataQuality;
