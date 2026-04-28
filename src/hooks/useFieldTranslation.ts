import { useCallback, useRef } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";

/**
 * Detect if text contains Japanese-specific characters (Hiragana, Katakana)
 */
function containsJapanese(text: string): boolean {
  return /[\u3040-\u309F\u30A0-\u30FF]/.test(text);
}

/**
 * On-demand field translation hook.
 * When language is en/ja/zh and a field is null, triggers edge function
 * to translate and cache in DB. Also translates Japanese content to Korean.
 * Calls onTranslated when done so UI can refetch.
 */
export const useFieldTranslation = () => {
  const { language } = useLanguage();
  const pendingRef = useRef<Set<string>>(new Set());

  const translateIfNeeded = useCallback(
    async (
      table: "ktrenz_keywords" | "ktrenz_trend_triggers" | "ktrenz_b2_items",
      field: "keyword" | "context" | "title" | "description",
      items: { id: string; [key: string]: any }[],
      onTranslated?: () => void
    ) => {
      // Determine target column name
      const targetColMap: Record<string, Record<string, string>> = {
        "ktrenz_keywords.keyword": { en: "keyword_en", ja: "keyword_ja", zh: "keyword_zh" },
        "ktrenz_keywords.context": { en: "context", ja: "context_ja", zh: "context_zh" },
        "ktrenz_trend_triggers.keyword": { en: "keyword_en", ja: "keyword_ja", zh: "keyword_zh" },
        "ktrenz_trend_triggers.context": { en: "context", ja: "context_ja", zh: "context_zh" },
        "ktrenz_b2_items.title": { en: "title_en", ja: "title_ja", zh: "title_zh", ko: "title_ko" },
        "ktrenz_b2_items.description": { en: "description_en", ja: "description_ja", zh: "description_zh", ko: "description_ko" },
      };

      const key = `${table}.${field}`;
      const targetCol = targetColMap[key]?.[language];
      if (!targetCol) return;

      // Find items that need translation
      const sourceCol =
        field === "keyword"
          ? "keyword_ko"
          : field === "title"
            ? "title"
            : field === "description"
              ? "description"
              : "context_ko";
      const needTranslation = items.filter((item) => {
        const sourceValue = item[sourceCol];
        const targetValue = item[targetCol];

        // For Korean: only translate if source contains Japanese characters.
        // Applies to b2_items.title and b2_items.description (the only fields
        // whose source can legitimately be non-Korean).
        if (language === "ko") {
          if (field !== "title" && field !== "description") return false;
          return !!sourceValue && !targetValue && typeof sourceValue === "string" && containsJapanese(sourceValue) && !pendingRef.current.has(`${item.id}-${key}-${language}`);
        }

        const isEnglishContextStale =
          field === "context" &&
          language === "en" &&
          typeof sourceValue === "string" &&
          typeof targetValue === "string" &&
          targetValue.trim() === sourceValue.trim();

        return !!sourceValue && (!targetValue || isEnglishContextStale) && !pendingRef.current.has(`${item.id}-${key}-${language}`);
      });

      if (needTranslation.length === 0) return;

      // Mark as pending to avoid duplicate calls
      const batchIds = needTranslation.slice(0, 20).map((item) => {
        const pendingKey = `${item.id}-${key}-${language}`;
        pendingRef.current.add(pendingKey);
        return item.id;
      });

      try {
        const { error } = await supabase.functions.invoke("ktrenz-translate-field", {
          body: { table, field, ids: batchIds, language },
        });

        if (error) {
          console.warn("Translation request failed:", error);
          batchIds.forEach((id) => pendingRef.current.delete(`${id}-${key}-${language}`));
          return;
        }

        onTranslated?.();
      } catch (err) {
        console.warn("Translation error:", err);
        batchIds.forEach((id) => pendingRef.current.delete(`${id}-${key}-${language}`));
      }
    },
    [language]
  );

  /**
   * Helper to pick the right field value based on current language
   */
  const pickField = useCallback(
    (item: Record<string, any>, field: "keyword" | "context"): string => {
      if (field === "keyword") {
        if (language === "ko") return item.keyword_ko || item.keyword || "";
        if (language === "en") return item.keyword_en || item.keyword || item.keyword_ko || "";
        if (language === "ja") return item.keyword_ja || item.keyword_ko || item.keyword || "";
        if (language === "zh") return item.keyword_zh || item.keyword_ko || item.keyword || "";
      }
      if (field === "context") {
        if (language === "ko") return item.context_ko || item.context || "";
        if (language === "en") return item.context || item.context_ko || "";
        if (language === "ja") return item.context_ja || item.context_ko || item.context || "";
        if (language === "zh") return item.context_zh || item.context_ko || item.context || "";
      }
      return "";
    },
    [language]
  );

  return { translateIfNeeded, pickField, language };
};
