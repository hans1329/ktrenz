import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, FileText, TrendingUp, MessageSquare } from 'lucide-react';

const AdminDashboard = () => {
  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const [usersRes, entriesRes, botUsersRes] = await Promise.all([
        supabase.from('ktrenz_user_logins' as any).select('id', { count: 'exact', head: true }),
        supabase.from('wiki_entries').select('id', { count: 'exact', head: true }),
        supabase.from('ktrenz_fan_agent_messages' as any).select('user_id', { count: 'exact', head: true }),
      ]);
      // 봇 사용자 수: 고유 user_id 수를 위해 distinct 쿼리
      const { data: distinctBotUsers } = await supabase
        .from('ktrenz_fan_agent_messages' as any)
        .select('user_id')
        .limit(1000);
      const uniqueBotUsers = new Set((distinctBotUsers || []).map((r: any) => r.user_id)).size;
      return {
        users: usersRes.count ?? 0,
        entries: entriesRes.count ?? 0,
        botUsers: uniqueBotUsers,
      };
    },
    staleTime: 1000 * 60 * 5,
  });

  const statCards = [
    { label: '총 유저', value: stats?.users ?? '-', icon: Users, color: 'text-blue-500' },
    { label: 'Wiki 엔트리', value: stats?.entries ?? '-', icon: FileText, color: 'text-green-500' },
    { label: '봇 사용자', value: stats?.botUsers ?? '-', icon: MessageSquare, color: 'text-purple-500' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {statCards.map((s) => (
          <Card key={s.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
              <s.icon className={`w-5 h-5 ${s.color}`} />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{s.value?.toLocaleString()}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default AdminDashboard;
