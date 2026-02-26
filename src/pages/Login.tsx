import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Loader2, Mail, ArrowLeft } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useLanguage } from "@/contexts/LanguageContext";
import kTrenzLogo from "@/assets/k-trenz-logo.webp";

const Login = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const [mode, setMode] = useState<"select" | "email-login" | "email-signup">("select");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && user) navigate("/", { replace: true });
  }, [user, authLoading, navigate]);

  const handleGoogleLogin = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      toast({ title: "Login failed", description: error.message, variant: "destructive" });
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) {
      toast({ title: "Login failed", description: error.message, variant: "destructive" });
    }
    setLoading(false);
  };

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      toast({ title: "Signup failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Check your email", description: "We sent you a confirmation link." });
      setMode("email-login");
    }
    setLoading(false);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <SEO title={t("login.title")} description="Sign in to KTrenZ to access K-Pop trend data and Fan Agent." path="/login" />
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
        <div className="absolute top-4 right-4"><LanguageSwitcher /></div>
        <div className="w-full max-w-sm space-y-8">
          {/* Logo */}
          <div className="flex flex-col items-center gap-4">
            <img src={kTrenzLogo} alt="KTRENDZ" className="h-7 w-auto" />
            <p className="text-muted-foreground text-sm text-center">
              {t("login.subtitle")}
            </p>
          </div>

          {mode === "select" && (
            <div className="space-y-3">
              {/* Google */}
              <Button
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full h-12 rounded-full bg-card border border-border text-foreground hover:bg-muted gap-3 text-sm font-medium"
                variant="outline"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                )}
                {t("login.google")}
              </Button>

              {/* Email */}
              <Button
                onClick={() => setMode("email-login")}
                className="w-full h-12 rounded-full gap-3 text-sm font-medium"
                variant="outline"
              >
                <Mail className="w-5 h-5" />
                {t("login.email")}
              </Button>
            </div>
          )}

          {(mode === "email-login" || mode === "email-signup") && (
            <form onSubmit={mode === "email-login" ? handleEmailLogin : handleEmailSignup} className="space-y-4">
              <button
                type="button"
                onClick={() => setMode("select")}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> {t("common.back")}
              </button>

              <div className="space-y-2">
                <Label htmlFor="email">{t("login.emailLabel")}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-12 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t("login.password")}</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="h-12 rounded-xl"
                />
              </div>

              {mode === "email-login" && (
                <button
                  type="button"
                  onClick={() => {
                    supabase.auth.resetPasswordForEmail(email.trim(), {
                      redirectTo: `${window.location.origin}/reset-password`,
                    }).then(({ error }) => {
                      if (error) {
                        toast({ title: "재설정 메일 전송 실패", description: error.message, variant: "destructive" });
                        return;
                      }
                      toast({ title: "재설정 메일을 보냈습니다", description: "메일함에서 링크를 확인해주세요." });
                    });
                  }}
                  className="text-xs text-primary hover:underline"
                >
                  비밀번호를 잊으셨나요?
                </button>
              )}

              <Button type="submit" disabled={loading} className="w-full h-12 rounded-full font-medium">
                {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {mode === "email-login" ? t("common.signIn") : t("login.createAccount")}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                {mode === "email-login" ? (
                  <>
                    {t("login.noAccount")}{" "}
                    <button type="button" onClick={() => setMode("email-signup")} className="text-primary hover:underline">
                      {t("login.signUp")}
                    </button>
                  </>
                ) : (
                  <>
                    {t("login.hasAccount")}{" "}
                    <button type="button" onClick={() => setMode("email-login")} className="text-primary hover:underline">
                      {t("common.signIn")}
                    </button>
                  </>
                )}
              </p>
            </form>
          )}

          {/* Back to home */}
          <div className="text-center">
            <button
              onClick={() => navigate("/")}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("login.backToRankings")}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default Login;
