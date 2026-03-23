import { useEffect, useState } from 'react';
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
  { label: 'Dashboard', path: '/b2b', icon: LayoutDashboard },
  { label: 'My Artists', path: '/b2b/my-artists', icon: Star },
  { label: 'Trend Monitor', path: '/b2b/trends', icon: TrendingUp },
  { label: 'Pre/Post Analysis', path: '/b2b/pre-post', icon: GitCompare },
  { label: 'Competitor Watch', path: '/b2b/competitors', icon: Target },
  { label: 'Campaign Impact', path: '/b2b/campaigns', icon: Zap },
  { label: 'Market Intelligence', path: '/b2b/market', icon: LineChart },
];

const brandNav = [
  { label: 'Dashboard', path: '/b2b', icon: LayoutDashboard },
  { label: 'Star Discovery', path: '/b2b/discovery', icon: Search },
  { label: 'Trend Monitor', path: '/b2b/trends', icon: TrendingUp },
  { label: 'Pre/Post Analysis', path: '/b2b/pre-post', icon: GitCompare },
  { label: 'Benchmark', path: '/b2b/benchmark', icon: BarChart3 },
  { label: 'Campaign ROI', path: '/b2b/campaigns', icon: Zap },
  { label: 'Market Intelligence', path: '/b2b/market', icon: LineChart },
];

const B2BLayout = () => {
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Fetch org membership
  const { data: membership, isLoading: memLoading } = useQuery({
    queryKey: ['b2b-membership', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await (supabase as any)
        .from('ktrenz_b2b_members')
        .select('*, org:ktrenz_b2b_organizations(*)')
        .eq('user_id', user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/b2b/login', { replace: true });
    }
    if (!authLoading && !memLoading && user && !membership) {
      navigate('/b2b/onboarding', { replace: true });
    }
  }, [authLoading, memLoading, user, membership, navigate]);

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
      {/* Sidebar */}
      <aside className={cn(
        "fixed left-0 top-0 h-full z-40 bg-[hsl(220,18%,10%)] border-r border-[hsl(220,15%,15%)] flex flex-col transition-all duration-200",
        sidebarOpen ? "w-56" : "w-14"
      )}>
        {/* Logo */}
        <div className="h-14 flex items-center px-3 border-b border-[hsl(220,15%,15%)] gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[hsl(270,80%,60%)] to-[hsl(200,80%,50%)] flex items-center justify-center shrink-0">
            <TrendingUp className="w-4 h-4 text-white" />
          </div>
          {sidebarOpen && (
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-bold text-white truncate">K·TrenZ</span>
              <span className="text-[10px] text-[hsl(270,80%,60%)] font-medium">B2B Platform</span>
            </div>
          )}
        </div>

        {/* Org info */}
        {sidebarOpen && (
          <div className="px-3 py-3 border-b border-[hsl(220,15%,15%)]">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-[hsl(220,15%,18%)] flex items-center justify-center text-xs">
                {org.org_type === 'entertainment' ? '🏢' : '🏷️'}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white truncate">{org.name}</p>
                <p className="text-[10px] text-[hsl(220,10%,45%)] capitalize">{org.org_type}</p>
              </div>
            </div>
          </div>
        )}

        {/* Nav */}
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

        {/* Bottom */}
        <div className="p-2 border-t border-[hsl(220,15%,15%)] space-y-1">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[hsl(220,10%,50%)] hover:bg-[hsl(220,15%,15%)] hover:text-white w-full"
          >
            {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            {sidebarOpen && <span>Collapse</span>}
          </button>
          <button
            onClick={signOut}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[hsl(220,10%,50%)] hover:bg-[hsl(220,15%,15%)] hover:text-white w-full"
          >
            <LogOut className="w-4 h-4" />
            {sidebarOpen && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className={cn("flex-1 flex flex-col transition-all duration-200", sidebarOpen ? "ml-56" : "ml-14")}>
        {/* Top bar */}
        <header className="h-14 border-b border-[hsl(220,15%,15%)] bg-[hsl(220,18%,10%)] flex items-center px-4 gap-4 sticky top-0 z-30">
          {/* Global AI Search */}
          <div className="flex-1 max-w-xl relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(220,10%,35%)]" />
            <Input
              placeholder="AI Search — Ask anything about stars, trends, campaigns..."
              className="pl-10 bg-[hsl(220,15%,12%)] border-[hsl(220,15%,18%)] text-white placeholder:text-[hsl(220,10%,30%)] h-9 text-sm"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[hsl(220,10%,30%)] bg-[hsl(220,15%,18%)] px-1.5 py-0.5 rounded">⌘K</span>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2">
            <select className="bg-[hsl(220,15%,12%)] border border-[hsl(220,15%,18%)] text-[hsl(220,10%,60%)] text-xs rounded-md px-2 py-1.5">
              <option>Last 7 days</option>
              <option>Last 30 days</option>
              <option>Last 90 days</option>
            </select>
          </div>

          {/* Notifications */}
          <button className="relative p-2 rounded-lg hover:bg-[hsl(220,15%,15%)] text-[hsl(220,10%,50%)]">
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[hsl(0,80%,55%)]" />
          </button>

          {/* User */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[hsl(270,60%,50%)] to-[hsl(200,60%,50%)] flex items-center justify-center text-white text-xs font-bold">
              {user.email?.[0]?.toUpperCase()}
            </div>
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
