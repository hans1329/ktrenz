// Simplified translation hook — passthrough (no translation in V3 standalone)
interface UsePageTranslationOptions {
  cacheKey: string;
  segments: Record<string, string>;
  enabled?: boolean;
}

export const usePageTranslation = ({ segments }: UsePageTranslationOptions) => {
  const t = (key: string) => segments[key] ?? key;

  return {
    t,
    isTranslating: false,
    isTranslated: false,
    isTranslatableLanguage: false,
    showOriginal: true,
    toggleOriginal: () => {},
    languageName: 'English',
  };
};
