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

const AUTH_STORAGE_KEY = 'sb-jguylowswwgjvotdcsfj-auth-token';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
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
    let initialSessionHandled = false;

    const handleSignedIn = async (uid: string) => {
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

        await (supabase as any)
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
          );
      } catch {}
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      if (!mounted) return;

      setSession(nextSession ?? null);
      setUser(nextSession?.user ?? null);

      if (event === 'INITIAL_SESSION') {
        initialSessionHandled = true;
        setLoading(false);
        return;
      }

      if (event === 'SIGNED_IN' && nextSession?.user?.id) {
        await handleSignedIn(nextSession.user.id);
      }

      if (event === 'SIGNED_OUT') {
        localStorage.removeItem(AUTH_STORAGE_KEY);
      }

      setLoading(false);
    });

    const initSession = async () => {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (!mounted) return;

        if (!currentSession) {
          localStorage.removeItem(AUTH_STORAGE_KEY);
        }

        setSession(currentSession ?? null);
        setUser(currentSession?.user ?? null);
      } catch {
        if (!mounted) return;
        localStorage.removeItem(AUTH_STORAGE_KEY);
        setSession(null);
        setUser(null);
      } finally {
        if (mounted && !initialSessionHandled) {
          setLoading(false);
        }
      }
    };

    initSession();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [queryClient]);

  const signOut = async () => {
    setUser(null);
    setSession(null);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    queryClient.clear();
    try { await supabase.auth.signOut(); } catch {}
    window.location.href = '/';
  };

  return { user, session, profile, loading, signOut, kPoints, isAdmin: false, isModerator: false };
};