import { useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';

interface UserProfile {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  current_level: number;
  total_points: number;
  available_points: number;
}

const getInitialSession = (): Session | null => {
  try {
    const data = localStorage.getItem('sb-jguylowswwgjvotdcsfj-auth-token');
    if (!data) return null;
    const parsed = JSON.parse(data);
    return parsed.currentSession ?? null;
  } catch {
    return null;
  }
};

export const useAuth = () => {
  const initialSession = getInitialSession();
  const [user, setUser] = useState<User | null>(initialSession?.user ?? null);
  const [session, setSession] = useState<Session | null>(initialSession ?? null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  const { data: profile = null } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('username, display_name, avatar_url, current_level, total_points, available_points')
        .eq('id', user.id)
        .single();
      if (error) throw error;
      return data as UserProfile;
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    let mounted = true;

    const initSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;
        setSession(session);
        setUser(session?.user ?? null);
      } catch {
        if (mounted) { setSession(null); setUser(null); }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setSession(session ?? null);
      setUser(session?.user ?? null);

      // KTrenZ 로그인 이력 기록
      if (session?.user?.id && _event === 'SIGNED_IN') {
        const uid = session.user.id;
        supabase
          .from('ktrenz_user_logins')
          .upsert(
            { user_id: uid, last_login_at: new Date().toISOString(), login_count: 1 },
            { onConflict: 'user_id', ignoreDuplicates: false }
          )
          .then(() => {
            supabase.rpc('increment_ktrenz_login_count' as any, { _user_id: uid });
          });
      }
    });

    return () => { mounted = false; subscription.unsubscribe(); };
  }, [queryClient]);

  const signOut = async () => {
    setUser(null);
    setSession(null);
    queryClient.clear();
    try { await supabase.auth.signOut(); } catch {}
    window.location.href = '/';
  };

  return { user, session, profile, loading, signOut, isAdmin: false, isModerator: false };
};
