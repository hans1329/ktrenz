import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { type Language } from "@/i18n/translations";

type Dict = Record<string, string>;

const loaders: Record<Language, () => Promise<{ default: Dict }>> = {
  en: () => import("@/i18n/en"),
  ko: () => import("@/i18n/ko"),
  ja: () => import("@/i18n/ja"),
  zh: () => import("@/i18n/zh"),
};

const cache = new Map<Language, Dict>();
const inflight = new Map<Language, Promise<Dict>>();

function loadLanguage(lang: Language): Promise<Dict> {
  const cached = cache.get(lang);
  if (cached) return Promise.resolve(cached);
  const pending = inflight.get(lang);
  if (pending) return pending;
  const p = loaders[lang]().then((m) => {
    cache.set(lang, m.default);
    inflight.delete(lang);
    return m.default;
  });
  inflight.set(lang, p);
  return p;
}

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const detectBrowserLanguage = (): Language => {
  try {
    const browserLang = navigator.language || (navigator as any).userLanguage || "";
    const prefix = browserLang.split("-")[0].toLowerCase();
    if (prefix === "ko") return "ko";
    if (prefix === "ja") return "ja";
    if (prefix === "zh") return "zh";
    if (prefix === "en") return "en";
  } catch {}
  return "ko";
};

const getStoredLanguage = (): Language => {
  try {
    const stored = localStorage.getItem("ktrenz-lang");
    if (stored && ["en", "ko", "ja", "zh"].includes(stored)) return stored as Language;
  } catch {}
  return detectBrowserLanguage();
};

// Kick off initial language load at module scope so it's in-flight before
// React mounts. By the time the first render completes, the chunk is usually
// already cached or close to it.
const initialLang = typeof window !== "undefined" ? getStoredLanguage() : "ko";
if (typeof window !== "undefined") {
  loadLanguage(initialLang);
}

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const lang = initialLang;
    (window as any).__ktrenz_lang = lang;
    return lang;
  });
  const [dict, setDict] = useState<Dict>(() => cache.get(initialLang) ?? {});
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadLanguage(language).then((d) => {
      if (!cancelled && mountedRef.current) setDict(d);
    });
    return () => { cancelled = true; };
  }, [language]);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try { localStorage.setItem("ktrenz-lang", lang); } catch {}
    document.documentElement.lang = lang;
    (window as any).__ktrenz_lang = lang;
  }, []);

  const t = useCallback((key: string): string => dict[key] ?? key, [dict]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    return {
      language: "ko" as Language,
      setLanguage: () => {},
      t: (key: string) => key,
    };
  }
  return ctx;
};
