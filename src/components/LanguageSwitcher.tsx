import { useState, useRef, useEffect } from "react";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { LANGUAGES } from "@/i18n/translations";

interface LanguageSwitcherProps {
  className?: string;
}

const LanguageSwitcher = ({ className }: LanguageSwitcherProps) => {
  const { language, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const current = LANGUAGES.find((l) => l.code === language)!;

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-2 py-1.5 rounded-full text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        aria-label="Change language"
      >
        <Globe className="w-3.5 h-3.5" />
        <span>{current.label}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-background border border-border rounded-xl shadow-lg z-[60] overflow-hidden min-w-[100px]">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => { setLanguage(lang.code); setOpen(false); }}
              className={cn(
                "flex items-center gap-2 w-full px-3 py-2 text-xs font-medium transition-colors text-left",
                language === lang.code
                  ? "bg-primary/10 text-primary"
                  : "text-foreground hover:bg-muted"
              )}
            >
              <span>{lang.flag}</span>
              <span>{lang.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default LanguageSwitcher;
