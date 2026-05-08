import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { LANGUAGES } from "@/i18n/translations";
import SEO from "@/components/SEO";

import { ArrowLeft, CreditCard, Bell, Shield, LogOut, ChevronRight, Loader2, Camera, Check, Flame, History, Trophy, Coins } from "lucide-react";
import { getDefaultAvatar } from "@/lib/defaultAvatar";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

const SettingsPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const fromProfile = (location.state as any)?.fromProfile;
  const { user, profile, loading } = useAuth();
  const { t, language, setLanguage } = useLanguage();
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
      toast({ title: "프로필 이미지가 변경되었습니다" });
    } catch (e: any) {
      toast({ title: e.message || "업로드 실패", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user?.id) return;
    const trimmedUsername = username.trim();
    const trimmedDisplay = displayName.trim();

    if (!trimmedUsername) {
      toast({ title: "닉네임을 입력해주세요", variant: "destructive" });
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
          toast({ title: "이미 사용 중인 닉네임입니다", variant: "destructive" });
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
          toast({ title: "이미 사용 중인 표시 이름입니다", variant: "destructive" });
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
      toast({ title: "프로필이 저장되었습니다" });
    } catch (e: any) {
      toast({ title: e.message || "저장 실패", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const discoverShortcuts = [
    { icon: History, label: "My calls", desc: "Vouch history & resolution status", onClick: () => navigate("/h1/history") },
    { icon: Trophy, label: "Leaderboard", desc: "Where you rank against other callers", onClick: () => navigate("/h1/leaderboard") },
    { icon: Coins, label: "K-Cash balance", desc: "Coming soon — earned from hits", comingSoon: true },
  ];

  const sections = [
    {
      title: "Account",
      items: [
        { icon: CreditCard, label: "K-Pass membership", desc: "Plan & upgrade", onClick: () => navigate("/kpass") },
        { icon: Shield, label: "Privacy", desc: user?.email || "", onClick: () => {} },
      ],
    },
    {
      title: "Notifications",
      items: [
        { icon: Bell, label: "Push notifications", desc: "Daily drop reminders & resolution alerts", comingSoon: true },
      ],
    },
  ];

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  return (
    <>
      <SEO title="Settings – KTrenZ" description="KTrenZ account & app settings" path="/settings" />
      <div className="min-h-screen bg-neutral-950 text-white pb-24">
        {/* Ambient backdrop — same brand wash used on /h1 */}
        <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
          <div className="absolute -top-1/3 -left-1/4 w-[60vw] h-[60vh] rounded-full blur-[200px] opacity-15 bg-rose-600" />
          <div className="absolute -bottom-1/3 -right-1/4 w-[60vw] h-[60vh] rounded-full blur-[200px] opacity-10 bg-orange-500" />
        </div>

        <header className="sticky top-0 z-50 bg-black/60 backdrop-blur-xl border-b border-white/10">
          <div className="flex items-center h-14 px-4 max-w-lg mx-auto">
            <button
              onClick={() => fromProfile ? navigate("/", { state: { openProfile: true } }) : navigate(-1)}
              className="p-2 -ml-2 text-white/55 hover:text-white"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="flex-1 text-center font-black text-base tracking-tight text-white">{t("common.settings")}</h1>
            <div className="w-9" />
          </div>
        </header>

        <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
          {/* Profile section */}
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/45 mb-2 px-1">
              Profile
            </p>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
              <div className="flex items-center gap-4">
                <label className="relative cursor-pointer group">
                  <Avatar className="w-16 h-16 ring-2 ring-white/10">
                    <AvatarImage src={profile?.avatar_url || getDefaultAvatar(user?.id)} />
                    <AvatarFallback className="bg-gradient-to-br from-rose-500 to-orange-500 text-white font-black">
                      {(profile?.display_name || profile?.username || "U").charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute inset-0 rounded-full bg-black/55 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    {uploading ? <Loader2 className="w-5 h-5 animate-spin text-white" /> : <Camera className="w-5 h-5 text-white" />}
                  </div>
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploading} />
                </label>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white truncate">
                    {profile?.display_name || profile?.username || "User"}
                  </p>
                  <p className="text-xs text-white/55 truncate">{user?.email}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-white/55 mb-1 block">Handle</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-white/45">@</span>
                    <Input
                      value={username}
                      onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
                      placeholder="username"
                      className="h-9 text-sm pl-7 bg-white/[0.04] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-rose-500/40"
                      maxLength={20}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-white/55 mb-1 block">Display name</label>
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Display Name"
                    className="h-9 text-sm bg-white/[0.04] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-rose-500/40"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={handleSaveProfile}
                  disabled={saving}
                  className="w-full bg-white text-black hover:bg-white/90 font-black"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Save
                </Button>
              </div>
            </div>
          </div>

          {/* Discover shortcuts */}
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/45 mb-2 px-1 inline-flex items-center gap-1.5">
              <Flame className="w-3 h-3 text-rose-400" /> Discover
            </p>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden divide-y divide-white/5">
              {discoverShortcuts.map((item) => (
                <button
                  key={item.label}
                  onClick={(item as any).onClick}
                  disabled={(item as any).comingSoon}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors",
                    (item as any).comingSoon ? "opacity-50" : "hover:bg-white/5",
                  )}
                >
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                    <item.icon className="w-4 h-4 text-white/70" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white">{item.label}</p>
                    <p className="text-[11px] text-white/45 truncate">{item.desc}</p>
                  </div>
                  {(item as any).comingSoon ? (
                    <span className="text-[10px] text-white/55 bg-white/5 px-2 py-0.5 rounded-full">Soon</span>
                  ) : (
                    <ChevronRight className="w-4 h-4 text-white/40 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {sections.map((section) => (
            <div key={section.title}>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/45 mb-2 px-1">
                {section.title}
              </p>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden divide-y divide-white/5">
                {section.items.map((item) => (
                  <button
                    key={item.label}
                    onClick={(item as any).onClick}
                    disabled={(item as any).comingSoon}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors",
                      (item as any).comingSoon ? "opacity-50" : "hover:bg-white/5",
                    )}
                  >
                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                      <item.icon className="w-4 h-4 text-white/70" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white">{item.label}</p>
                      <p className="text-[11px] text-white/45 truncate">{item.desc}</p>
                    </div>
                    {(item as any).custom ? (
                      <div onClick={(e) => e.stopPropagation()}>{(item as any).custom}</div>
                    ) : (item as any).comingSoon ? (
                      <span className="text-[10px] text-white/55 bg-white/5 px-2 py-0.5 rounded-full">Soon</span>
                    ) : (
                      <ChevronRight className="w-4 h-4 text-white/40 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* Language */}
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/45 mb-2 px-1">
              Language
            </p>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden divide-y divide-white/5">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => setLanguage(lang.code)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/5"
                >
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0 text-base">
                    {lang.flag}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white">{lang.label}</p>
                    <p className="text-[11px] text-white/45">{lang.code.toUpperCase()}</p>
                  </div>
                  {language === lang.code && <Check className="w-4 h-4 text-rose-400 shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-white/10 bg-white/[0.02] text-white/65 hover:text-white hover:bg-white/[0.05] transition-colors text-sm font-bold"
          >
            <LogOut className="w-4 h-4" />
            {t("common.signOut")}
          </button>

          <p className="text-center text-[10px] text-white/30 pt-2 tracking-wider">
            KTrenZ · © 2026
          </p>
        </div>
      </div>
    </>
  );
};

export default SettingsPage;
