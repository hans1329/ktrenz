import { useEffect, useState } from 'react';
import { Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import { Loader2, LayoutDashboard, Users, FileText, LogOut, ChevronLeft, Trophy, Coins, Music, HeartPulse, ShoppingBag, Brain, Activity, MonitorPlay, Building2, Database, FlaskConical, ShieldAlert, ShieldCheck, CalendarDays, UserPlus, Star, TrendingUp, Newspaper, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

const navItems = [
  { label: '대시보드', path: '/admin', icon: LayoutDashboard },
  { label: '랭킹 관리', path: '/admin/rankings', icon: Trophy },
  { label: '아티스트 관리', path: '/admin/v3-artists', icon: Music },
  { label: '데이터 헬스', path: '/admin/data-health', icon: HeartPulse },
  { label: '수집 모니터', path: '/admin/collection-monitor', icon: Database },
  { label: '데이터 품질 감시', path: '/admin/data-quality', icon: ShieldAlert },
  { label: 'Pipeline Guard', path: '/admin/pipeline-guard', icon: ShieldCheck },
  { label: '이벤트 라벨링', path: '/admin/signal-events', icon: CalendarDays },
  { label: 'FES 분석 에이전트', path: '/admin/fes-analyst', icon: FlaskConical },
  { label: 'K-토큰 설정', path: '/admin/points', icon: Coins },
  { label: '상품 관리', path: '/admin/products', icon: ShoppingBag },
  { label: '유저 관리', path: '/admin/users', icon: Users },
  { label: '인텐트 분석', path: '/admin/intents', icon: Brain },
  { label: '인텐트 모니터', path: '/admin/intent-monitor', icon: Activity },
  { label: '참조 유튜브 목록', path: '/admin/watched-channels', icon: MonitorPlay },
  { label: '에이전시 샘플', path: '/admin/agency-sample', icon: Building2 },
  { label: '등록 요청', path: '/admin/listing-requests', icon: UserPlus },
  { label: '스타 관리', path: '/admin/stars', icon: Star },
  { label: 'T2 트렌드 인텔', path: '/admin/trend-intel', icon: TrendingUp },
  { label: '쇼핑 키워드', path: '/admin/shopping-keywords', icon: ShoppingBag },
  { label: 'SEO 리포트', path: '/admin/auto-report', icon: Newspaper },
  { label: 'Wiki 항목', path: '/admin/entries', icon: FileText },
];

const NavList = ({ onNavigate }: { onNavigate?: () => void }) => {
  const location = useLocation();
  return (
    <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
      {navItems.map((item) => {
        const active = location.pathname === item.path;
        return (
          <Link
            key={item.path}
            to={item.path}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
              active ? 'bg-primary/10 text-primary font-semibold' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <item.icon className="w-4 h-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
};

const AdminLayout = () => {
  const { user, isAdmin, loading, signOut } = useAdminAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      navigate('/admin/login', { replace: true });
    }
  }, [loading, user, isAdmin, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user || !isAdmin) return null;

  // Mobile layout
  if (isMobile) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        {/* Mobile top bar */}
        <header className="h-12 flex items-center px-3 border-b border-border bg-card gap-2 shrink-0">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSidebarOpen(true)}>
            <Menu className="w-5 h-5" />
          </Button>
          <span className="text-sm font-bold text-foreground">관리자</span>
          <Link to="/" className="ml-auto text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
            <ChevronLeft className="w-3 h-3" /> 사이트
          </Link>
        </header>

        {/* Mobile sidebar sheet */}
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="w-64 p-0 flex flex-col" hideClose>
            <SheetHeader className="p-4 border-b border-border">
              <SheetTitle className="text-sm">관리자 메뉴</SheetTitle>
            </SheetHeader>
            <NavList onNavigate={() => setSidebarOpen(false)} />
            <div className="p-3 border-t border-border">
              <p className="text-[11px] text-muted-foreground truncate mb-2 px-1">{user.email}</p>
              <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={signOut}>
                <LogOut className="w-4 h-4 mr-2" /> 로그아웃
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        {/* Main content */}
        <main className="flex-1 p-3 overflow-auto">
          <Outlet />
        </main>
      </div>
    );
  }

  // Desktop layout
  return (
    <div className="min-h-screen flex bg-background">
      <aside className="w-56 border-r border-border bg-card flex flex-col shrink-0">
        <div className="h-14 flex items-center px-4 border-b border-border gap-2">
          <Link to="/" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <ChevronLeft className="w-3 h-3" /> 사이트로
          </Link>
          <span className="ml-auto text-sm font-bold text-foreground">관리자</span>
        </div>
        <NavList />
        <div className="p-3 border-t border-border">
          <p className="text-xs text-muted-foreground truncate mb-2 px-1">{user.email}</p>
          <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={signOut}>
            <LogOut className="w-4 h-4 mr-2" /> 로그아웃
          </Button>
        </div>
      </aside>
      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;
