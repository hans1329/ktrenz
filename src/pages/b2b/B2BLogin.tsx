import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Building2, TrendingUp, Mail, Lock, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const B2BLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        toast({ title: 'Check your email', description: 'We sent a confirmation link.' });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // Admin users are treated as enterprise members automatically
          const { data: isAdmin } = await supabase.rpc('is_admin', { user_id: user.id });
          if (isAdmin) {
            navigate('/b2b');
            return;
          }
          const { data: membership } = await (supabase as any)
            .from('ktrenz_b2b_members')
            .select('org_id')
            .eq('user_id', user.id)
            .maybeSingle();
          if (membership) {
            navigate('/b2b');
          } else {
            navigate('/b2b/onboarding');
          }
        }
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[hsl(220,20%,8%)] flex">
      {/* Left branding */}
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
            Star × Trend<br />Intelligence Platform
          </h1>
          <p className="text-[hsl(220,10%,60%)] text-lg leading-relaxed">
            Discover, verify, and interpret the commercial impact of K-Pop trends before the market does.
          </p>
          <div className="grid grid-cols-2 gap-4 pt-4">
            {[
              { icon: '🏢', label: 'Entertainment', desc: 'Manage & monetize your stars' },
              { icon: '🏷️', label: 'Brand', desc: 'Find & leverage star power' },
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

      {/* Right login form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-6">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[hsl(270,80%,60%)] to-[hsl(200,80%,50%)] flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <span className="text-xl font-bold text-white">K·TrenZ B2B</span>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-white">{isSignUp ? 'Create Account' : 'Welcome Back'}</h2>
            <p className="text-[hsl(220,10%,50%)] mt-1">
              {isSignUp ? 'Sign up with your company email' : 'Sign in to your workspace'}
            </p>
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
                  placeholder="Password"
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
              {loading ? 'Processing...' : isSignUp ? 'Create Account' : 'Sign In'}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </form>

          <div className="text-center">
            <button
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-sm text-[hsl(220,10%,50%)] hover:text-[hsl(270,80%,60%)] transition-colors"
            >
              {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default B2BLogin;
