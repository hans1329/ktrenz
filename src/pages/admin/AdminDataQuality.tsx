import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ShieldAlert, CheckCircle2, AlertTriangle, XCircle, Loader2,
  Play, Filter, RefreshCw,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

type Severity = 'critical' | 'high' | 'medium' | 'low';

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
};

const AdminDataQuality = () => {
  const queryClient = useQueryClient();
  const [severityFilter, setSeverityFilter] = useState<Severity | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [showResolved, setShowResolved] = useState(false);

  // Fetch issues
  const { data: issues, isLoading } = useQuery({
    queryKey: ['data-quality-issues', showResolved],
    queryFn: async () => {
      let q = supabase
        .from('ktrenz_data_quality_issues' as any)
        .select('*')
        .order('detected_at', { ascending: false });

      if (!showResolved) {
        q = q.eq('resolved', false);
      }

      const { data } = await q.limit(500);
      return (data ?? []) as any[];
    },
    staleTime: 30_000,
  });

  // Run auditor
  const runAudit = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('ktrenz-data-auditor');
      if (error) throw error;
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      return parsed;
    },
    onSuccess: (data) => {
      toast.success(`감사 완료: ${data.issues_found}건 이슈 발견 (${data.artists_checked}명 검사)`);
      queryClient.invalidateQueries({ queryKey: ['data-quality-issues'] });
    },
    onError: (err) => {
      toast.error(`감사 실패: ${(err as Error).message}`);
    },
  });

  // Resolve issue
  const resolveIssue = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      await supabase
        .from('ktrenz_data_quality_issues' as any)
        .update({
          resolved: true,
          resolved_at: new Date().toISOString(),
          resolution_note: note,
        })
        .eq('id', id);
    },
    onSuccess: () => {
      toast.success('이슈 해결됨');
      queryClient.invalidateQueries({ queryKey: ['data-quality-issues'] });
    },
  });

  const filtered = (issues ?? []).filter((i: any) => {
    if (severityFilter !== 'all' && i.severity !== severityFilter) return false;
    if (typeFilter !== 'all' && i.issue_type !== typeFilter) return false;
    return true;
  });

  // Summary
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-primary" /> 데이터 품질 감시
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Tier 1 아티스트 데이터 수집 이상 탐지 · 자동 감사 · 수동 해결
          </p>
        </div>
        <Button
          onClick={() => runAudit.mutate()}
          disabled={runAudit.isPending}
          size="sm"
          className="gap-2"
        >
          {runAudit.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          감사 실행
        </Button>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">미해결 전체</p>
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

      {/* Filters */}
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

      {/* Issues Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            이슈 목록 ({filtered.length}건)
          </CardTitle>
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
