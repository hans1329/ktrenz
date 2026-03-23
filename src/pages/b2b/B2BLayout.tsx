import { useEffect, useState, useRef, useCallback } from 'react';
import { Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, TrendingUp, Users, BarChart3, Search, Bell,
  Settings, LogOut, ChevronLeft, Building2, Target, Zap,
  Star, GitCompare, Brain, LineChart, ShoppingBag, Menu, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

const entertainmentNav = [
  { label: '대시보드', path: '/b2b', icon: LayoutDashboard },
  { label: '소속 아티스트', path: '/b2b/my-artists', icon: Star },
  { label: '트렌드 모니터', path: '/b2b/trends', icon: TrendingUp },
  { label: 'Pre/Post 분석', path: '/b2b/pre-post', icon: GitCompare },
  { label: '경쟁사 모니터링', path: '/b2b/competitors', icon: Target },
  { label: '캠페인 임팩트', path: '/b2b/campaigns', icon: Zap },
  { label: '시장 인텔리전스', path: '/b2b/market', icon: LineChart },
];

const brandNav = [
  { label: '대시보드', path: '/b2b', icon: LayoutDashboard },
  { label: '스타 탐색', path: '/b2b/discovery', icon: Search },
  { label: '트렌드 모니터', path: '/b2b/trends', icon: TrendingUp },
  { label: 'Pre/Post 분석', path: '/b2b/pre-post', icon: GitCompare },
  { label: '벤치마크', path: '/b2b/benchmark', icon: BarChart3 },
  { label: '캠페인 ROI', path: '/b2b/campaigns', icon: Zap },
  { label: '시장 인텔리전스', path: '/b2b/market', icon: LineChart },
];

const B2BLayout = () => {
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Search state
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
    if (!authLoading && !user) {
      navigate('/b2b/login', { replace: true });
    }
    if (!authLoading && user && isFetched && !memLoading && !membership) {
      navigate('/b2b/onboarding', { replace: true });
    }
  }, [authLoading, memLoading, isFetched, user, membership, navigate]);

  // Close search on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Debounced search
  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!q.trim()) {
      setSearchResults([]);
      setSearchOpen(false);
      return;
    }
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
      <div className="min-h-screen flex items-center justify-center bg-[hsl(220,20%,8%)]">
        <Loader2 className="w-6 h-6 animate-spin text-[hsl(220,10%,40%)]" />
      </div>
    );
  }

  if (!user || !membership) return null;

  const org = membership.org;
  const navItems = org.org_type === 'entertainment' ? entertainmentNav : brandNav;

  return (
    <div className="min-h-screen flex bg-[hsl(220,20%,8%)]">
      {/* 사이드바 */}
      <aside className={cn(
        "fixed left-0 top-0 h-full z-40 bg-[hsl(220,18%,10%)] border-r border-[hsl(220,15%,15%)] flex flex-col transition-all duration-200",
        sidebarOpen ? "w-56" : "w-14"
      )}>
        {/* 로고 */}
        <div className="h-14 flex items-center px-3 border-b border-[hsl(220,15%,15%)] gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[hsl(270,80%,60%)] to-[hsl(200,80%,50%)] flex items-center justify-center shrink-0">
            <TrendingUp className="w-4 h-4 text-white" />
          </div>
          {sidebarOpen && (
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-bold text-white truncate">K·TrenZ</span>
              <span className="text-[10px] text-[hsl(270,80%,60%)] font-medium">B2B 플랫폼</span>
            </div>
          )}
        </div>

        {/* 조직 정보 */}
        {sidebarOpen && (
          <div className="px-3 py-3 border-b border-[hsl(220,15%,15%)]">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-[hsl(220,15%,18%)] flex items-center justify-center text-xs">
                {org.org_type === 'entertainment' ? '🏢' : '🏷️'}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white truncate">{org.name}</p>
                <p className="text-[10px] text-[hsl(220,10%,45%)]">
                  {org.org_type === 'entertainment' ? '엔터테인먼트' : '브랜드'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 네비게이션 */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-auto">
          {navItems.map(item => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                title={item.label}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                  active
                    ? 'bg-[hsl(270,80%,55%,0.15)] text-[hsl(270,80%,70%)] font-semibold'
                    : 'text-[hsl(220,10%,50%)] hover:bg-[hsl(220,15%,15%)] hover:text-white'
                )}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                {sidebarOpen && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* 하단 */}
        <div className="p-2 border-t border-[hsl(220,15%,15%)] space-y-1">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[hsl(220,10%,50%)] hover:bg-[hsl(220,15%,15%)] hover:text-white w-full"
          >
            {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            {sidebarOpen && <span>접기</span>}
          </button>
          <button
            onClick={signOut}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[hsl(220,10%,50%)] hover:bg-[hsl(220,15%,15%)] hover:text-white w-full"
          >
            <LogOut className="w-4 h-4" />
            {sidebarOpen && <span>로그아웃</span>}
          </button>
        </div>
      </aside>

      {/* 메인 영역 */}
      <div className={cn("flex-1 flex flex-col transition-all duration-200", sidebarOpen ? "ml-56" : "ml-14")}>
        {/* 상단 바 */}
        <header className="h-14 border-b border-[hsl(220,15%,15%)] bg-[hsl(220,18%,10%)] flex items-center px-4 gap-4 sticky top-0 z-30">
          {/* AI 검색 */}
          <div className="flex-1 max-w-xl relative" ref={searchRef}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(220,10%,35%)]" />
            <Input
              value={searchQuery}
              onChange={e => handleSearch(e.target.value)}
              onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
              placeholder="스타 검색 — 이름으로 검색하세요..."
              className="pl-10 bg-[hsl(220,15%,12%)] border-[hsl(220,15%,18%)] text-white placeholder:text-[hsl(220,10%,30%)] h-9 text-sm"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[hsl(220,10%,30%)] bg-[hsl(220,15%,18%)] px-1.5 py-0.5 rounded">⌘K</span>

            {/* Search dropdown */}
            {searchOpen && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[hsl(220,15%,12%)] border border-[hsl(220,15%,20%)] rounded-lg shadow-2xl overflow-hidden z-50 max-h-80 overflow-y-auto">
                {searchResults.map((star: any) => (
                  <button
                    key={star.id}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[hsl(220,15%,16%)] transition-colors text-left"
                    onClick={() => {
                      setSearchOpen(false);
                      setSearchQuery('');
                      // Navigate to star detail or add to tracked
                      navigate(`/b2b/artist/${star.id}`);
                    }}
                  >
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-[hsl(220,15%,18%)] shrink-0">
                      {star.image_url ? (
                        <img src={star.image_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[hsl(220,10%,35%)] text-sm font-bold">
                          {star.display_name?.[0]}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white font-medium truncate">{star.display_name}</p>
                      <p className="text-xs text-[hsl(220,10%,45%)] truncate">
                        {star.name_ko && star.name_ko !== star.display_name ? `${star.name_ko} · ` : ''}
                        {star.star_type === 'group' ? '그룹' : star.star_type === 'member' ? '멤버' : '솔로'}
                        {star.agency ? ` · ${star.agency}` : ''}
                      </p>
                    </div>
                    <Star className="w-3.5 h-3.5 text-[hsl(220,10%,30%)] shrink-0" />
                  </button>
                ))}
              </div>
            )}
            {searchOpen && searchQuery && searchResults.length === 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[hsl(220,15%,12%)] border border-[hsl(220,15%,20%)] rounded-lg shadow-2xl p-4 z-50">
                <p className="text-sm text-[hsl(220,10%,40%)] text-center">검색 결과가 없습니다</p>
              </div>
            )}
          </div>

          {/* 필터 */}
          <div className="flex items-center gap-2">
            <select className="bg-[hsl(220,15%,12%)] border border-[hsl(220,15%,18%)] text-[hsl(220,10%,60%)] text-xs rounded-md px-2 py-1.5">
              <option>최근 7일</option>
              <option>최근 30일</option>
              <option>최근 90일</option>
            </select>
          </div>

          {/* 알림 */}
          <button className="relative p-2 rounded-lg hover:bg-[hsl(220,15%,15%)] text-[hsl(220,10%,50%)]">
            <Bell className="w-4 h-4" />
          </button>

          {/* 사용자 */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[hsl(270,60%,50%)] to-[hsl(200,60%,50%)] flex items-center justify-center text-white text-xs font-bold">
              {user.email?.[0]?.toUpperCase()}
            </div>
          </div>
        </header>

        {/* 콘텐츠 */}
        <main className="flex-1 overflow-auto">
          <Outlet context={{ org, membership }} />
        </main>
      </div>
    </div>
  );
};

export default B2BLayout;
