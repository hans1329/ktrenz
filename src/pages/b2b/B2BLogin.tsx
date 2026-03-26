import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Building2, TrendingUp, Mail, Lock, ArrowRight, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

const B2BLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();

  // If already logged in, redirect to B2B
  useEffect(() => {
    if (authLoading || !user) return;
    const checkMembership = async () => {
      const { data: isAdmin } = await supabase.rpc('is_admin', { user_id: user.id });
      if (isAdmin) { navigate('/b2b', { replace: true }); return; }
      const { data: membership } = await (supabase as any)
        .from('ktrenz_b2b_members')
        .select('org_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (membership) {
        navigate('/b2b', { replace: true });
      } else {
        navigate('/b2b/onboarding', { replace: true });
      }
    };
    checkMembership();
  }, [user, authLoading, navigate]);

  const handleGoogleLogin = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/b2b` },
    });
    if (error) {
      toast({ title: '오류', description: error.message, variant: 'destructive' });
      setLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        toast({ title: '이메일을 확인해주세요', description: '인증 링크를 발송했습니다.' });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // useEffect will handle redirect
      }
    } catch (err: any) {
      toast({ title: '오류', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[hsl(220,20%,8%)] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[hsl(270,80%,60%)]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[hsl(220,20%,8%)] flex">
      {/* 좌측 브랜딩 */}
      <div className="hidden lg:flex flex-1 items-center justify-center p-12 bg-gradient-to-br from-[hsl(220,20%,8%)] to-[hsl(250,30%,15%)]">
        <div className="max-w-md space-y-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[hsl(270,80%,60%)] to-[hsl(200,80%,50%)] flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <span className="text-2xl font-bold text-white tracking-tight">K·TrenZ</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-[hsl(270,80%,60%)] text-white">B2B</span>
          </div>
          <h1 className="text-4xl font-bold text-white leading-tight">
            스타 × 트렌드<br />인텔리전스 플랫폼
          </h1>
          <p className="text-[hsl(220,10%,60%)] text-lg leading-relaxed">
            K-Pop 트렌드의 상업적 영향력을 시장보다 먼저 발견하고, 검증하고, 해석합니다.
          </p>
          <div className="grid grid-cols-2 gap-4 pt-4">
            {[
              { icon: '🏢', label: '엔터테인먼트', desc: '스타 관리 & 수익화' },
              { icon: '🏷️', label: '브랜드', desc: '스타 파워 발굴 & 활용' },
            ].map(item => (
              <div key={item.label} className="p-4 rounded-xl border border-[hsl(220,15%,20%)] bg-[hsl(220,15%,12%)]">
                <span className="text-2xl">{item.icon}</span>
                <p className="text-white font-semibold mt-2">{item.label}</p>
                <p className="text-[hsl(220,10%,50%)] text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 우측 로그인 폼 */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-6">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[hsl(270,80%,60%)] to-[hsl(200,80%,50%)] flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <span className="text-xl font-bold text-white">K·TrenZ B2B</span>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-white">{isSignUp ? '계정 만들기' : '다시 오신 것을 환영합니다'}</h2>
            <p className="text-[hsl(220,10%,50%)] mt-1">
              {isSignUp ? '기업 이메일로 가입하세요' : '워크스페이스에 로그인하세요'}
            </p>
          </div>

          {/* Google Login */}
          <Button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full h-11 bg-[hsl(220,15%,12%)] border border-[hsl(220,15%,20%)] hover:bg-[hsl(220,15%,16%)] text-white font-medium gap-3"
            variant="outline"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
            )}
            Google로 로그인
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-[hsl(220,15%,20%)]" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-[hsl(220,20%,8%)] px-3 text-[hsl(220,10%,40%)]">또는</span>
            </div>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <div className="space-y-2">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(220,10%,40%)]" />
                <Input
                  type="email"
                  placeholder="company@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="pl-10 bg-[hsl(220,15%,12%)] border-[hsl(220,15%,20%)] text-white placeholder:text-[hsl(220,10%,35%)] h-11"
                  required
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(220,10%,40%)]" />
                <Input
                  type="password"
                  placeholder="비밀번호"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="pl-10 bg-[hsl(220,15%,12%)] border-[hsl(220,15%,20%)] text-white placeholder:text-[hsl(220,10%,35%)] h-11"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-gradient-to-r from-[hsl(270,80%,55%)] to-[hsl(200,80%,50%)] hover:opacity-90 text-white font-semibold"
            >
              {loading ? '처리 중...' : isSignUp ? '계정 만들기' : '로그인'}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </form>

          <div className="text-center">
            <button
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-sm text-[hsl(220,10%,50%)] hover:text-[hsl(270,80%,60%)] transition-colors"
            >
              {isSignUp ? '이미 계정이 있으신가요? 로그인' : '계정이 없으신가요? 회원가입'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default B2BLogin;
