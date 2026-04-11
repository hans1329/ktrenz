import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, FileText, Send, ExternalLink, CheckCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const AdminAutoReport = () => {
  const [reportType, setReportType] = useState<'daily' | 'weekly'>('daily');
  const [generating, setGenerating] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  const handleGenerate = async () => {
    setGenerating(true);
    setLastResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke('ktrenz-auto-report', {
        body: { report_type: reportType },
      });

      if (res.error) throw new Error(res.error.message);

      const result = res.data;
      if (result.skipped) {
        toast.warning('트렌드 키워드가 없어 리포트를 건너뛰었습니다.');
        setLastResult({ skipped: true, reason: result.reason });
      } else if (result.success) {
        toast.success(`${result.report_type} 리포트 ${result.posts?.length || 0}건 발행 완료`);
        setLastResult(result);
      } else {
        throw new Error(result.error || 'Unknown error');
      }
    } catch (err: any) {
      console.error('Report generation error:', err);
      toast.error(`리포트 생성 실패: ${err.message}`);
      setLastResult({ error: err.message });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">SEO 자동 리포트</h1>
        <p className="text-sm text-muted-foreground mt-1">
          트렌드 키워드 기반 SEO 리포트를 Ghost에 자동 발행합니다
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4" />
            리포트 생성
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Select value={reportType} onValueChange={(v) => setReportType(v as 'daily' | 'weekly')}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">일간 리포트</SelectItem>
                <SelectItem value="weekly">주간 리포트</SelectItem>
              </SelectContent>
            </Select>

            <Button onClick={handleGenerate} disabled={generating} className="gap-2">
              {generating ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> 생성 중...</>
              ) : (
                <><Send className="w-4 h-4" /> 리포트 발행</>
              )}
            </Button>
          </div>

          <div className="text-xs text-muted-foreground space-y-1">
            <p>• 데이터: ktrenz_discover_keywords + b2_predictions + ktrenz_b2_items</p>
            <p>• 언어: 한국어 + 영어 동시 발행</p>
            <p>• 배틀 참여 수치: ×8.5 multiplier 적용</p>
            <p>• 발행 경로: ktrenz.com/report/</p>
          </div>
        </CardContent>
      </Card>

      {lastResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {lastResult.error ? (
                <><AlertTriangle className="w-4 h-4 text-destructive" /> 결과 (실패)</>
              ) : lastResult.skipped ? (
                <><AlertTriangle className="w-4 h-4 text-yellow-500" /> 건너뜀</>
              ) : (
                <><CheckCircle className="w-4 h-4 text-green-500" /> 발행 완료</>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lastResult.error && (
              <p className="text-sm text-destructive">{lastResult.error}</p>
            )}
            {lastResult.skipped && (
              <p className="text-sm text-muted-foreground">사유: {lastResult.reason}</p>
            )}
            {lastResult.posts && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant="outline">{lastResult.report_type}</Badge>
                  <span className="text-muted-foreground">{lastResult.date}</span>
                </div>
                {lastResult.posts.map((post: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <Badge variant="secondary" className="mt-0.5">{post.lang.toUpperCase()}</Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{post.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">slug: {post.slug}</p>
                    </div>
                    {post.url && (
                      <a href={post.url} target="_blank" rel="noopener noreferrer"
                         className="text-primary hover:text-primary/80">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AdminAutoReport;
