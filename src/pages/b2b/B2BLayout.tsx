import { useEffect, useState, useRef, useCallback } from 'react';
import { Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, TrendingUp, Users, BarChart3, Search, Bell,
  Settings, LogOut, ChevronLeft, Star, Target, Zap,
  GitCompare, LineChart, Menu, Globe, Lightbulb, Rocket
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

const entertainmentNav = [
  { section: 'Overview', items: [
    { label: '대시보드', path: '/b2b', icon: LayoutDashboard, enabled: true },
    { label: 'Radar', path: '/b2b/radar', icon: Target, badge: 3, enabled: false },
  ]},
  { section: 'Intelligence', items: [
    { label: 'Artists', path: '/b2b/artists', icon: Star, enabled: true },
    { label: 'Brands', path: '/b2b/brands', icon: BarChart3, enabled: false },
    { label: 'Campaigns', path: '/b2b/campaigns', icon: Zap, enabled: false },
    { label: 'Benchmark', path: '/b2b/benchmark', icon: GitCompare, enabled: false },
  ]},
  { section: 'Markets', items: [
    { label: 'Markets', path: '/b2b/markets', icon: Globe, enabled: false },
    { label: 'Recommendations', path: '/b2b/rec', icon: Lightbulb, enabled: false },
  ]},
  { section: 'Activation', items: [
    { label: 'Activation Studio', path: '/b2b/studio', icon: Rocket, enabled: false },
  ]},
];

const brandNav = entertainmentNav; // Same for now

const B2BLayout = () => {
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const { data: membership, isLoading: memLoading, isFetched } = useQuery({
    queryKey: ['b2b-membership', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await (supabase as any)
        .from('ktrenz_b2b_members')
        .select('*, org:ktrenz_b2b_organizations(*)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
    refetchOnMount: 'always',
  });

  useEffect(() => {
    if (!authLoading && !user) navigate('/b2b/login', { replace: true });
    if (!authLoading && user && isFetched && !memLoading && !membership)
      navigate('/b2b/onboarding', { replace: true });
  }, [authLoading, memLoading, isFetched, user, membership, navigate]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!q.trim()) { setSearchResults([]); setSearchOpen(false); return; }
    searchTimerRef.current = setTimeout(async () => {
      const { data } = await (supabase as any)
        .from('ktrenz_stars')
        .select('id, display_name, name_ko, star_type, agency, image_url')
        .or(`display_name.ilike.%${q}%,name_ko.ilike.%${q}%`)
        .eq('is_active', true)
        .limit(10);
      setSearchResults(data || []);
      setSearchOpen(true);
    }, 300);
  }, []);

  if (authLoading || memLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F0F2F5]">
        <Loader2 className="w-6 h-6 animate-spin text-[#9CA3AF]" />
      </div>
    );
  }

  if (!user || !membership) return null;

  const org = membership.org;
  const navGroups = org.org_type === 'entertainment' ? entertainmentNav : brandNav;
  const sideW = sidebarCollapsed ? 'w-[56px]' : 'w-[220px]';
  const mainML = sidebarCollapsed ? 'ml-[56px]' : 'ml-[220px]';

  return (
    <div className="min-h-screen bg-[#F0F2F5]">
      {/* ── SIDEBAR ── */}
      <aside className={cn(
        "fixed left-0 top-0 h-full z-40 bg-[#0F1B35] flex flex-col transition-all duration-200",
        sideW
      )}>
        {/* Logo */}
        <div className="px-5 pt-5 pb-4 border-b border-white/[0.08]">
          {!sidebarCollapsed ? (
            <>
              <div className="text-lg font-extrabold text-white tracking-tight">Ktrenz</div>
              <div className="text-[10px] text-white/40 mt-0.5 uppercase tracking-[1.5px]">Business Intelligence</div>
            </>
          ) : (
            <div className="text-lg font-extrabold text-white text-center">K</div>
          )}
        </div>

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto">
          {navGroups.map(group => (
            <div key={group.section}>
              {!sidebarCollapsed && (
                <div className="px-5 pt-[18px] pb-[6px] text-[9px] font-bold text-white/30 uppercase tracking-[1.5px]">
                  {group.section}
                </div>
              )}
              {group.items.map(item => {
                const isExactActive = item.path === '/b2b' ? location.pathname === '/b2b' : location.pathname.startsWith(item.path);
                const disabled = !item.enabled;

                if (disabled) {
                  return (
                    <div
                      key={item.path}
                      title={`${item.label} (준비 중)`}
                      className="relative flex items-center gap-[10px] px-5 py-[9px] text-[13px] text-white/20 cursor-not-allowed select-none"
                    >
                      <item.icon className="w-[15px] h-[15px] shrink-0 opacity-40" />
                      {!sidebarCollapsed && <span>{item.label}</span>}
                      {!sidebarCollapsed && (
                        <span className="ml-auto text-[9px] font-semibold text-white/15 uppercase tracking-wider">Soon</span>
                      )}
                    </div>
                  );
                }

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    title={item.label}
                    className={cn(
                      "relative flex items-center gap-[10px] px-5 py-[9px] text-[13px] transition-all",
                      isExactActive
                        ? "bg-[rgba(59,130,246,0.18)] text-[#60A5FA] font-semibold"
                        : "text-white/60 hover:bg-white/[0.06] hover:text-white"
                    )}
                  >
                    {isExactActive && (
                      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#3B82F6] rounded-r" />
                    )}
                    <item.icon className="w-[15px] h-[15px] shrink-0" />
                    {!sidebarCollapsed && <span>{item.label}</span>}
                    {!sidebarCollapsed && 'badge' in item && item.badge && (
                      <span className="ml-auto bg-[#EF4444] text-white text-[10px] font-bold px-[6px] py-px rounded-[10px]">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Bottom */}
        <div className="mt-auto px-5 py-4 border-t border-white/[0.08]">
          {!sidebarCollapsed && (
            <>
              <div className="bg-[rgba(59,130,246,0.2)] border border-[rgba(59,130,246,0.4)] text-[#60A5FA] text-[11px] font-semibold px-3 py-[6px] rounded-[6px] text-center mb-[10px]">
                Pro Plan
              </div>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#3B82F6] to-[#8B5CF6] flex items-center justify-center text-[11px] font-bold text-white shrink-0">
                  {user.email?.[0]?.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-white/70 font-medium truncate">{org.name}</div>
                  <div className="text-[10px] text-white/35 truncate">{user.email}</div>
                </div>
              </div>
            </>
          )}
          <div className="flex gap-1 mt-3">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="flex-1 flex items-center justify-center gap-2 py-1.5 rounded text-white/50 hover:bg-white/[0.06] hover:text-white text-xs"
            >
              {sidebarCollapsed ? <Menu className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
            <button
              onClick={signOut}
              className="flex-1 flex items-center justify-center gap-2 py-1.5 rounded text-white/50 hover:bg-white/[0.06] hover:text-white text-xs"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <div className={cn("flex flex-col min-h-screen transition-all duration-200", mainML)}>
        {/* Topbar */}
        <header className="h-[52px] bg-white border-b border-[#E5E7EB] flex items-center justify-between px-6 sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#9CA3AF]">
              Stars Intelligence › <span className="text-[#374151] font-semibold">Overview</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative w-72" ref={searchRef}>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9CA3AF]" />
              <input
                value={searchQuery}
                onChange={e => handleSearch(e.target.value)}
                onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
                placeholder="스타 검색..."
                className="w-full pl-9 pr-3 py-[6px] rounded-[6px] border border-[#E5E7EB] bg-[#F9FAFB] text-[13px] text-[#374151] placeholder:text-[#9CA3AF] outline-none focus:border-[#93C5FD]"
              />
              {searchOpen && searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#E5E7EB] rounded-lg shadow-xl overflow-hidden z-50 max-h-80 overflow-y-auto">
                  {searchResults.map((star: any) => (
                    <button
                      key={star.id}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#F9FAFB] transition-colors text-left"
                      onClick={() => { setSearchOpen(false); setSearchQuery(''); navigate(`/b2b/artist/${star.id}`); }}
                    >
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-[#F3F4F6] shrink-0">
                        {star.image_url ? (
                          <img src={star.image_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[#9CA3AF] text-sm font-bold">
                            {star.display_name?.[0]}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] text-[#111827] font-medium truncate">{star.display_name}</p>
                        <p className="text-[11px] text-[#9CA3AF] truncate">
                          {star.name_ko && star.name_ko !== star.display_name ? `${star.name_ko} · ` : ''}
                          {star.agency || ''}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button className="relative w-8 h-8 rounded-lg bg-[#F3F4F6] flex items-center justify-center text-[#6B7280] hover:bg-[#E5E7EB]">
              <Bell className="w-4 h-4" />
              <span className="absolute top-[5px] right-[5px] w-[7px] h-[7px] bg-[#EF4444] rounded-full border border-white" />
            </button>

            <button className="px-[14px] py-[6px] rounded-[6px] text-[12px] font-semibold bg-[#F3F4F6] text-[#374151] border border-[#E5E7EB] hover:bg-[#E5E7EB]">
              ROI 시뮬레이터
            </button>
            <button className="px-[14px] py-[6px] rounded-[6px] text-[12px] font-semibold bg-[#2563EB] text-white hover:bg-[#1D4ED8]">
              + 캠페인 등록
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto">
          <Outlet context={{ org, membership }} />
        </main>
      </div>
    </div>
  );
};

export default B2BLayout;
