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

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // Stable hook slot — keeps hook count consistent across HMR updates
  const [_hmrStable] = useState(0);
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

  const { data: kPoints = 0 } = useQuery({
    queryKey: ['ktrenz-points', user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;
      const { data } = await supabase
        .from('ktrenz_user_points')
        .select('points')
        .eq('user_id', user.id)
        .maybeSingle();
      return data?.points ?? 0;
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 2,
  });

  useEffect(() => {
    let mounted = true;

    const recordSignedInSideEffects = (uid: string) => {
      supabase
        .from('ktrenz_user_logins')
        .upsert(
          { user_id: uid, last_login_at: new Date().toISOString(), login_count: 1 },
          { onConflict: 'user_id', ignoreDuplicates: false }
        )
        .then(() => {
          supabase.rpc('increment_ktrenz_login_count' as any, { _user_id: uid });
        });

      supabase.rpc('ktrenz_daily_login_reward' as any, { _user_id: uid }).then(({ data }) => {
        if (data && data > 0) {
          queryClient.invalidateQueries({ queryKey: ['ktrenz-points', uid] });
        }
      });

      try {
        const lang = navigator.language || 'en';
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
        const LANG_TO_COUNTRY: Record<string, string> = {
          ko: 'KR', ja: 'JP', zh: 'CN', en: 'US', fr: 'FR', de: 'DE', es: 'ES', pt: 'BR', it: 'IT', ru: 'RU',
          th: 'TH', vi: 'VN', id: 'ID', ms: 'MY', hi: 'IN', ar: 'SA', tr: 'TR', pl: 'PL', nl: 'NL', sv: 'SE',
        };
        const parts = lang.split('-');
        const countryCode = parts[1]?.toUpperCase() || LANG_TO_COUNTRY[parts[0]] || null;

        (supabase as any)
          .from('ktrenz_user_locales')
          .upsert(
            {
              user_id: uid,
              browser_language: lang,
              browser_timezone: tz,
              country_code: countryCode,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' }
          )
          .then(() => {});
      } catch {}
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;

      setSession(nextSession ?? null);
      setUser(nextSession?.user ?? null);
      setLoading(false);

      if (event === 'SIGNED_IN' && nextSession?.user?.id) {
        recordSignedInSideEffects(nextSession.user.id);
      }

      if (event === 'SIGNED_OUT') {
        queryClient.clear();
      }
    });

    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      if (!mounted) return;
      setSession(currentSession ?? null);
      setUser(currentSession?.user ?? null);
      setLoading(false);
    }).catch(() => {
      if (!mounted) return;
      setSession(null);
      setUser(null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [queryClient]);

  const signOut = async () => {
    setUser(null);
    setSession(null);
    queryClient.clear();
    try { await supabase.auth.signOut(); } catch {}
    window.location.href = '/';
  };

  return { user, session, profile, loading, signOut, kPoints, isAdmin: false, isModerator: false };
};