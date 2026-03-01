import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import SEO from "@/components/SEO";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { ArrowLeft, CreditCard, Globe, Moon, Bell, Shield, LogOut, ChevronRight, Loader2, Camera, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const SettingsPage = () => {
  const navigate = useNavigate();
  const { user, profile, loading } = useAuth();
  const { t } = useLanguage();
  const queryClient = useQueryClient();

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate("/login", { replace: true });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || "");
      setUsername(profile.username || "");
    }
  }, [profile]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const compressToWebp = (file: File, maxSize = 512): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          const ratio = Math.min(maxSize / width, maxSize / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("압축 실패"))),
          "image/webp",
          0.8
        );
      };
      img.onerror = () => reject(new Error("이미지 로드 실패"));
      img.src = URL.createObjectURL(file);
    });
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    setUploading(true);
    try {
      const webpBlob = await compressToWebp(file);
      const path = `${user.id}/avatar.webp`;
      const { error: uploadErr } = await supabase.storage.from("avatars").upload(path, webpBlob, { upsert: true, contentType: "image/webp" });
      if (uploadErr) throw uploadErr;
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      const urlWithCache = `${publicUrl}?t=${Date.now()}`;
      const { error: updateErr } = await supabase.from("profiles").update({ avatar_url: urlWithCache }).eq("id", user.id);
      if (updateErr) throw updateErr;
      queryClient.invalidateQueries({ queryKey: ["profile", user.id] });
      toast.success("프로필 이미지가 변경되었습니다");
    } catch (e: any) {
      toast.error(e.message || "업로드 실패");
    } finally {
      setUploading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user?.id) return;
    const trimmedUsername = username.trim();
    const trimmedDisplay = displayName.trim();

    if (!trimmedUsername) {
      toast.error("닉네임을 입력해주세요");
      return;
    }

    setSaving(true);
    try {
      // 닉네임 중복 체크
      if (trimmedUsername !== profile?.username) {
        const { data: existing } = await supabase
          .from("profiles")
          .select("id")
          .eq("username", trimmedUsername)
          .neq("id", user.id)
          .maybeSingle();
        if (existing) {
          toast.error("이미 사용 중인 닉네임입니다");
          setSaving(false);
          return;
        }
      }

      // 표시이름 중복 체크
      if (trimmedDisplay && trimmedDisplay !== profile?.display_name) {
        const { data: existing } = await supabase
          .from("profiles")
          .select("id")
          .eq("display_name", trimmedDisplay)
          .neq("id", user.id)
          .maybeSingle();
        if (existing) {
          toast.error("이미 사용 중인 표시 이름입니다");
          setSaving(false);
          return;
        }
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: trimmedDisplay || null,
          username: trimmedUsername,
        })
        .eq("id", user.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["profile", user.id] });
      toast.success("프로필이 저장되었습니다");
    } catch (e: any) {
      toast.error(e.message || "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const sections = [
    {
      title: "계정",
      items: [
        { icon: CreditCard, label: "K-Pass 멤버십", desc: "현재 플랜 확인 및 업그레이드", onClick: () => navigate("/kpass") },
        { icon: Shield, label: "개인정보", desc: user?.email || "", onClick: () => {} },
      ],
    },
    {
      title: "앱 설정",
      items: [
        { icon: Globe, label: t("common.settings"), desc: "언어 변경", custom: <LanguageSwitcher /> },
        { icon: Bell, label: "알림", desc: "푸시 알림 설정", comingSoon: true },
        { icon: Moon, label: "다크 모드", desc: "자동 (시스템 설정 따름)", comingSoon: true },
      ],
    },
  ];

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  return (
    <>
      <SEO title="설정 – KTrenZ" description="KTrenZ 앱 설정" path="/settings" />
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50">
          <div className="flex items-center h-14 px-4 max-w-lg mx-auto">
            <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="flex-1 text-center font-bold text-lg">{t("common.settings")}</h1>
            <div className="w-9" />
          </div>
        </header>

        <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
          {/* Profile Edit Section */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 px-1">
              프로필
            </p>
            <div className="rounded-xl border border-border bg-card p-4 space-y-4">
              <div className="flex items-center gap-4">
                <label className="relative cursor-pointer group">
                  <Avatar className="w-16 h-16 border-2 border-border">
                    <AvatarImage src={profile?.avatar_url || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xl font-semibold">
                      {profile?.username?.[0]?.toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    {uploading ? <Loader2 className="w-5 h-5 animate-spin text-white" /> : <Camera className="w-5 h-5 text-white" />}
                  </div>
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploading} />
                </label>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-foreground truncate">
                    {profile?.display_name || profile?.username || "User"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground mb-1 block">닉네임 (핸들)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">@</span>
                    <Input
                      value={username}
                      onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
                      placeholder="username"
                      className="h-9 text-sm pl-7"
                      maxLength={20}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground mb-1 block">표시 이름</label>
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Display Name"
                    className="h-9 text-sm"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={handleSaveProfile}
                  disabled={saving}
                  className="w-full"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  저장
                </Button>
              </div>
            </div>
          </div>

          {sections.map((section) => (
            <div key={section.title}>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 px-1">
                {section.title}
              </p>
              <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
                {section.items.map((item) => (
                  <button
                    key={item.label}
                    onClick={item.onClick}
                    disabled={item.comingSoon}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors",
                      item.comingSoon ? "opacity-50" : "hover:bg-muted/50"
                    )}
                  >
                    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <item.icon className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{item.label}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{item.desc}</p>
                    </div>
                    {item.custom ? (
                      <div onClick={(e) => e.stopPropagation()}>{item.custom}</div>
                    ) : item.comingSoon ? (
                      <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Soon</span>
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* Sign Out */}
          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-destructive/30 text-destructive hover:bg-destructive/5 transition-colors text-sm font-medium"
          >
            <LogOut className="w-4 h-4" />
            {t("common.signOut")}
          </button>

          <p className="text-center text-[10px] text-muted-foreground pt-2">
            KTrenZ v3.0 · © 2025 KTrenZ
          </p>
        </div>
      </div>
    </>
  );
};

export default SettingsPage;
