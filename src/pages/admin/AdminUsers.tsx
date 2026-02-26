import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

interface KtrenzUser {
  user_id: string;
  username: string | null;
  display_name: string | null;
  profile_avatar: string | null;
  agent_avatar: string | null;
  points: number;
  lifetime_points: number;
  first_login_at: string;
  last_login_at: string;
  login_count: number;
  agent_msg_count: number;
}

const AdminUsers = () => {
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-ktrenz-users'],
    queryFn: async () => {
      const { data: logins, error: loginErr } = await supabase
        .from('ktrenz_user_logins')
        .select('user_id, first_login_at, last_login_at, login_count')
        .order('last_login_at', { ascending: false });
      if (loginErr) throw loginErr;
      if (!logins || logins.length === 0) return [];

      const userIds = logins.map(l => l.user_id);

      const [profilesRes, agentsRes, pointsRes, msgRes] = await Promise.all([
        supabase.from('profiles').select('id, username, display_name, avatar_url').in('id', userIds),
        supabase.from('ktrenz_agent_profiles').select('user_id, avatar_url').in('user_id', userIds),
        supabase.from('ktrenz_user_points').select('user_id, points, lifetime_points').in('user_id', userIds),
        supabase.from('ktrenz_fan_agent_messages').select('user_id').in('user_id', userIds),
      ]);

      const profileMap = new Map((profilesRes.data || []).map(p => [p.id, p]));
      const agentMap = new Map((agentsRes.data || []).map(a => [a.user_id, a]));
      const pointsMap = new Map((pointsRes.data || []).map(p => [p.user_id, p]));

      const msgCountMap = new Map<string, number>();
      (msgRes.data || []).forEach(m => {
        msgCountMap.set(m.user_id, (msgCountMap.get(m.user_id) || 0) + 1);
      });

      return logins.map((l): KtrenzUser => {
        const profile = profileMap.get(l.user_id);
        const agent = agentMap.get(l.user_id);
        const pts = pointsMap.get(l.user_id);
        return {
          user_id: l.user_id,
          username: profile?.username ?? null,
          display_name: profile?.display_name ?? null,
          profile_avatar: profile?.avatar_url ?? null,
          agent_avatar: agent?.avatar_url ?? null,
          points: pts?.points ?? 0,
          lifetime_points: pts?.lifetime_points ?? 0,
          first_login_at: l.first_login_at,
          last_login_at: l.last_login_at,
          login_count: l.login_count,
          agent_msg_count: msgCountMap.get(l.user_id) || 0,
        };
      });
    },
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">KTrenZ Users</h1>
        <p className="text-sm text-muted-foreground mt-1">
          KTrenZ 로그인 이력 유저 · 총 {users.length}명
        </p>
      </div>
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead className="text-right">K-Points</TableHead>
              <TableHead className="text-right">채팅</TableHead>
              <TableHead className="text-right">로그인</TableHead>
              <TableHead>최근 접속</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.user_id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={u.profile_avatar || undefined} />
                      <AvatarFallback className="text-xs">{u.username?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-sm">{u.display_name || u.username || 'Unknown'}</p>
                      {u.username && <p className="text-xs text-muted-foreground">@{u.username}</p>}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {u.agent_avatar && (
                    <Avatar className="w-7 h-7 rounded-lg">
                      <AvatarImage src={u.agent_avatar} className="object-cover" />
                      <AvatarFallback className="rounded-lg text-[10px]">AG</AvatarFallback>
                    </Avatar>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">{u.points.toLocaleString()}</TableCell>
                <TableCell className="text-right font-mono text-xs text-muted-foreground">{u.agent_msg_count}</TableCell>
                <TableCell className="text-right font-mono text-xs text-muted-foreground">{u.login_count}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(u.last_login_at).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">등록된 KTrenZ 유저가 없습니다</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default AdminUsers;
