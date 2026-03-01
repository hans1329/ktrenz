import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, MessageSquare, Database, CheckCircle, AlertTriangle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

const PLATFORMS = [
  { key: 'buzz_multi', label: 'Buzz' },
  { key: 'hanteo', label: 'Hanteo' },
  { key: 'music', label: 'Music' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'naver_news', label: 'Naver News' },
];

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

  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const [usersRes, botUsersRes] = await Promise.all([
        supabase.from('ktrenz_user_logins' as any).select('id', { count: 'exact', head: true }),
        supabase.from('ktrenz_fan_agent_messages' as any).select('user_id').limit(1000),
      ]);
      const uniqueBotUsers = new Set((botUsersRes.data || []).map((r: any) => r.user_id)).size;
      return {
        users: usersRes.count ?? 0,
        botUsers: uniqueBotUsers,
      };
    },
    staleTime: 1000 * 60 * 5,
  });

  const { data: collectionStats } = useQuery({
    queryKey: ['admin-collection-stats'],
    queryFn: async () => {
      const { data } = await supabase
        .from('ktrenz_collection_log' as any)
        .select('platform, status, collected_at')
        .order('collected_at', { ascending: false })
        .limit(500);
      if (!data) return { platforms: {}, total24h: 0 };

      const now = Date.now();
      const h24 = 24 * 3600000;
      const platforms: Record<string, { success: number; fail: number; latest: string }> = {};
      let total24h = 0;

      for (const row of data as any[]) {
        const age = now - new Date(row.collected_at).getTime();
        if (!platforms[row.platform]) {
          platforms[row.platform] = { success: 0, fail: 0, latest: row.collected_at };
        }
        if (age < h24) {
          if (row.status === 'success') platforms[row.platform].success++;
          else platforms[row.platform].fail++;
          total24h++;
        }
      }
      return { platforms, total24h };
    },
    staleTime: 1000 * 60 * 2,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card
          className="cursor-pointer hover:border-primary/40 transition-colors"
          onClick={() => navigate('/admin/users')}
        >
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

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">24h 수집 건수</CardTitle>
            <Database className="w-5 h-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{(collectionStats?.total24h ?? '-').toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Collection Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">최근 데이터 집계 현황</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {PLATFORMS.map(({ key, label }) => {
            const p = collectionStats?.platforms?.[key];
            const isStale = p?.latest
              ? Date.now() - new Date(p.latest).getTime() > 26 * 3600000
              : true;

            return (
              <div key={key} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/40">
                <div className="flex items-center gap-2">
                  {!p ? (
                    <Clock className="w-4 h-4 text-muted-foreground" />
                  ) : isStale ? (
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                  ) : (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  )}
                  <span className="text-sm font-medium">{label}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {p ? (
                    <>
                      <span className="text-green-500 font-semibold">{p.success} ok</span>
                      {p.fail > 0 && <span className="text-red-500 font-semibold">{p.fail} fail</span>}
                      <span>{formatAge(p.latest)}</span>
                    </>
                  ) : (
                    <span>데이터 없음</span>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminDashboard;
