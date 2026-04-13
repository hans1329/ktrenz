import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface UserProfile {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  current_level: number;
  total_points: number;
  available_points: number;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  kPoints: number;
  isAdmin: boolean;
  isModerator: boolean;
  showWelcomeBonus: boolean;
  setShowWelcomeBonus: (v: boolean) => void;
  welcomeBonusAmount: number;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** Loading timeout – if auth state isn't resolved within 5 s, force loading=false */
const AUTH_LOADING_TIMEOUT_MS = 5_000;

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [showWelcomeBonus, setShowWelcomeBonus] = useState(false);
  const welcomeBonusAmountRef = useRef(0);
  const queryClient = useQueryClient();
  const handledSignIns = useRef(new Set<string>());

  const grantWelcomeBonus = async (uid: string): Promise<number> => {
    try {
      const { data: setting } = await supabase
        .from('ktrenz_point_settings')
        .select('points, is_enabled')
        .eq('reward_type', 'welcome_bonus')
        .maybeSingle();
      if (!setting?.is_enabled || !setting.points) return 0;
      const amount = setting.points;

      // Check if already granted
      const { data: existing } = await supabase
        .from('ktrenz_point_transactions')
        .select('id')
        .eq('user_id', uid)
        .eq('reason', 'welcome_bonus')
        .maybeSingle();
      if (existing) return 0;

      // Upsert points
      await supabase
        .from('ktrenz_user_points')
        .upsert(
          { user_id: uid, points: amount, lifetime_points: amount },
          { onConflict: 'user_id' }
        );

      // Record transaction
      await supabase
        .from('ktrenz_point_transactions')
        .insert({ user_id: uid, amount, reason: 'welcome_bonus', description: 'Welcome bonus' });

      queryClient.invalidateQueries({ queryKey: ['ktrenz-points', uid] });
      return amount;
    } catch {
      return 0;
    }
  };

  // Guard: once onAuthStateChange fires, skip the getSession fallback
  const resolvedByListener = useRef(false);

  const { data: profile = null } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('username, display_name, avatar_url, current_level, total_points, available_points')
        .eq('id', user.id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as UserProfile | null;
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

  // ── Core auth initialisation ──────────────────────────────────
  useEffect(() => {
    let mounted = true;

    const recordSignedInSideEffects = (uid: string) => {
      if (handledSignIns.current.has(uid)) return;
      handledSignIns.current.add(uid);

      supabase
        .from('ktrenz_user_logins')
        .upsert(
          { user_id: uid, last_login_at: new Date().toISOString(), login_count: 1 },
          { onConflict: 'user_id', ignoreDuplicates: false }
        )
        .then(() => {
          supabase.rpc('increment_ktrenz_login_count' as any, { _user_id: uid });
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

    // 1) Set up listener FIRST so we catch INITIAL_SESSION
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;

      resolvedByListener.current = true;
      setSession(nextSession ?? null);
      setUser(nextSession?.user ?? null);
      setLoading(false);

      if (event === 'SIGNED_IN' && nextSession?.user?.id) {
        recordSignedInSideEffects(nextSession.user.id);

        const uid = nextSession.user.id;
        const seenKey = `ktrenz-welcome-bonus-seen-${uid}`;
        if (!localStorage.getItem(seenKey)) {
          const createdAt = new Date(nextSession.user.created_at).getTime();
          const now = Date.now();
          if (now - createdAt < 60_000) {
            localStorage.setItem(seenKey, '1');
            // Grant welcome bonus points
            grantWelcomeBonus(uid).then((amount) => {
              if (amount > 0) {
                welcomeBonusAmountRef.current = amount;
                setTimeout(() => setShowWelcomeBonus(true), 500);
              }
            });
          } else {
            localStorage.setItem(seenKey, '1');
          }
        }
      }

      if (event === 'SIGNED_OUT') {
        handledSignIns.current.clear();
        queryClient.clear();
      }
    });

    // 2) getSession as fallback only if listener hasn't fired yet
    supabase.auth
      .getSession()
      .then(({ data: { session: currentSession } }) => {
        if (!mounted || resolvedByListener.current) return;
        setSession(currentSession ?? null);
        setUser(currentSession?.user ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (!mounted || resolvedByListener.current) return;
        setSession(null);
        setUser(null);
        setLoading(false);
      });

    // 3) Loading timeout – never stay on spinner forever
    const timeoutId = setTimeout(() => {
      if (!mounted) return;
      setLoading(false);
    }, AUTH_LOADING_TIMEOUT_MS);

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, [queryClient]);

  // ── Visibility-based session refresh ──────────────────────────
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      // Tab came back – re-validate the session silently
      supabase.auth.getSession().then(({ data: { session: refreshed } }) => {
        setSession(refreshed ?? null);
        setUser(refreshed?.user ?? null);
        // If the session expired while the tab was hidden, clear queries
        if (!refreshed) {
          queryClient.clear();
        }
      });
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [queryClient]);

  const signOut = useCallback(async () => {
    setUser(null);
    setSession(null);
    handledSignIns.current.clear();
    queryClient.clear();
    try {
      await supabase.auth.signOut();
    } catch {}
    window.location.href = '/';
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    session,
    profile,
    loading,
    signOut,
    kPoints,
    isAdmin: false,
    isModerator: false,
    showWelcomeBonus,
    setShowWelcomeBonus,
    welcomeBonusAmount: welcomeBonusAmountRef.current,
  }), [user, session, profile, loading, signOut, kPoints, showWelcomeBonus]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
