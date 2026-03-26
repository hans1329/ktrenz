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
  // Simple dedup set (recreated per mount, no useRef needed to avoid HMR hook-order issues)
  const [signedInHandled] = useState(() => ({ current: new Set<string>() }));

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

    // Fire-and-forget login side effects (DO NOT await inside onAuthStateChange)
    const handleSignedIn = (uid: string) => {
      // Deduplicate within this mount cycle
      if (signedInHandled.current.has(uid)) return;
      signedInHandled.current.add(uid);

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

    // 1. Register listener FIRST (Supabase recommended pattern)
    // INITIAL_SESSION fires synchronously during registration and includes
    // the result of any token exchange (OAuth hash params, PKCE code, etc.).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;

      // Always update state from the event
      setSession(nextSession ?? null);
      setUser(nextSession?.user ?? null);

      if (event === 'INITIAL_SESSION') {
        // Session fully resolved (including OAuth redirect token exchange)
        setLoading(false);
      }

      if (event === 'SIGNED_IN' && nextSession?.user?.id) {
        handleSignedIn(nextSession.user.id);
      }

      if (event === 'SIGNED_OUT') {
        // Clean up stale tokens
        try { localStorage.removeItem(AUTH_STORAGE_KEY); } catch {}
        queryClient.clear();
      }

      if (event === 'TOKEN_REFRESHED') {
        // Session successfully refreshed — no action needed
      }
    });

    // 2. Safety fallback: if INITIAL_SESSION hasn't fired within 3s, force loading=false
    const timeout = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 3000);

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [queryClient]);

  const signOut = async () => {
    setUser(null);
    setSession(null);
    try { localStorage.removeItem(AUTH_STORAGE_KEY); } catch {}
    queryClient.clear();
    try { await supabase.auth.signOut(); } catch {}
    window.location.href = '/';
  };

  return { user, session, profile, loading, signOut, kPoints, isAdmin: false, isModerator: false };
};
