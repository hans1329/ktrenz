import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const useAdminAuth = () => {
  const { user, session, loading: authLoading, signOut } = useAuth();

  const { data: isAdmin = false, isLoading: roleLoading } = useQuery({
    queryKey: ['admin-role', user?.id],
    queryFn: async () => {
      if (!user?.id) return false;
      const { data, error } = await supabase.rpc('is_admin', { user_id: user.id });
      if (error) return false;
      return !!data;
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 10,
  });

  return {
    user,
    session,
    isAdmin,
    loading: authLoading || roleLoading,
    signOut,
  };
};
