import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import translations, { type Language } from "@/i18n/translations";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const getStoredLanguage = (): Language => {
  try {
    const stored = localStorage.getItem("ktrenz-lang");
    if (stored && ["en", "ko", "ja", "zh"].includes(stored)) return stored as Language;
  } catch {}
  return "ko";
};

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const lang = getStoredLanguage();
    (window as any).__ktrenz_lang = lang;
    return lang;
  });

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try { localStorage.setItem("ktrenz-lang", lang); } catch {}
    document.documentElement.lang = lang;
    (window as any).__ktrenz_lang = lang;
  }, []);

  const t = useCallback((key: string): string => {
    return translations[key]?.[language] ?? translations[key]?.en ?? key;
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    // Fallback for edge cases (HMR, rendering outside provider)
    return {
      language: "ko" as Language,
      setLanguage: () => {},
      t: (key: string) => key,
    };
  }
  return ctx;
};
