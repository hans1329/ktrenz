import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import SEO from "@/components/SEO";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { ArrowLeft, CreditCard, Globe, Moon, Bell, Shield, LogOut, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const SettingsPage = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { t } = useLanguage();

  useEffect(() => {
    if (!loading && !user) navigate("/login", { replace: true });
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

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
