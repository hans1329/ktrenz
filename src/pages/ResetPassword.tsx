import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Lock, ArrowLeft } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const isRecoveryFlow = useMemo(() => {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    return hashParams.get("type") === "recovery";
  }, []);

  useEffect(() => {
    if (!isRecoveryFlow) return;
    supabase.auth.getSession();
  }, [isRecoveryFlow]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 6) {
      toast({
        title: "비밀번호가 너무 짧습니다",
        description: "최소 6자 이상 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "비밀번호가 일치하지 않습니다",
        description: "비밀번호 확인 값을 다시 확인해주세요.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      toast({
        title: "비밀번호 변경 실패",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "비밀번호가 변경되었습니다",
      description: "새 비밀번호로 다시 로그인해주세요.",
    });
    navigate("/login", { replace: true });
  };

  return (
    <>
      <SEO title="Reset Password | KTrenZ" description="Reset your KTrenZ account password securely." path="/reset-password" />
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-2">
            <CardTitle className="text-xl">비밀번호 재설정</CardTitle>
            <CardDescription>
              {isRecoveryFlow
                ? "새 비밀번호를 입력해주세요."
                : "유효하지 않은 재설정 링크입니다. 로그인 화면에서 다시 요청해주세요."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isRecoveryFlow ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">새 비밀번호</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={6}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">새 비밀번호 확인</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    minLength={6}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Lock className="w-4 h-4 mr-2" />}
                  비밀번호 변경
                </Button>
              </form>
            ) : (
              <Button variant="outline" className="w-full" onClick={() => navigate("/login")}>
                <ArrowLeft className="w-4 h-4 mr-2" /> 로그인으로 돌아가기
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default ResetPassword;
