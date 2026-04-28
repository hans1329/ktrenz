/**
 * Sanitize article descriptions scraped into b2_items.
 *
 * Sources are heterogeneous (Naver news, blogs, social) and frequently smuggle
 * inline CSS/JS/templates and editorial boilerplate (bylines, photo credits,
 * email addresses). Keep this pure so it can be unit-tested and reused.
 *
 * Returns the cleaned text, or null if the description should be hidden
 * entirely (looks like code, garbled, or a language mismatch).
 */

export type Lang = "en" | "ko" | "ja" | "zh";

export type SanitizeOptions = {
  /** UI language. If provided, descriptions whose dominant script doesn't
   *  match are hidden (returned as null). Omit to skip the language gate. */
  uiLanguage?: Lang;
  /** Cap output length; longer text is truncated with an ellipsis. */
  maxLength?: number;
};

const DEFAULT_MAX_LENGTH = 300;

/* ── Code / template detection ─────────────────────────────────────── */

const CODE_PATTERNS: RegExp[] = [
  // CSS rule that starts at the top — `.class {` or `#id {`
  /^\s*[.#][\w-]+\s*\{/,
  // Mustache / Handlebars
  /\{\{[\w#/]/,
  // Inline CSS block: `selector { prop: val }`
  /[\w.#-]+\s*\{[^}]*:[^}]*\}/,
  // jQuery / DOM calls — very rare in prose
  /\$\(\s*(?:window|document|this|['"`])/,
  // Function expression / arrow function
  /\bfunction\s*\([^)]*\)\s*\{/,
  // Single-line code comment at the start of the description
  /^\s*\/\/\s/,
  // Multiple `var`/`let`/`const` declarations (3+ → almost certainly code)
  // Done separately with a count so we don't false-positive on single mentions.
];

function looksLikeCode(text: string): boolean {
  for (const re of CODE_PATTERNS) {
    if (re.test(text)) return true;
  }
  // Multiple `var x = ` declarations, or `;`-heavy text are strong code signals.
  const varDecls = (text.match(/\bvar\s+\w+\s*=/g) ?? []).length;
  if (varDecls >= 2) return true;
  const semicolons = (text.match(/;/g) ?? []).length;
  if (semicolons >= 5 && /[\w)]\s*;\s*\w/.test(text)) return true;
  return false;
}

/* ── Garbled encoding ──────────────────────────────────────────────── */

function isGarbled(text: string): boolean {
  const garbledCount = (text.match(/[\x00-\x08�]/g) ?? []).length;
  return garbledCount > 5;
}

/* ── Editorial boilerplate stripping ───────────────────────────────── */

function stripEditorialBoilerplate(input: string): string {
  let s = input;
  // [서울=뉴시스]기자명 기자 = , (서울=연합뉴스) etc.
  s = s.replace(/[\[(]\s*\S+=\S+[\])]\s*\S+\s*기자\s*=\s*/g, "").trim();
  s = s.replace(/^\s*\S+\s+기자\s*=\s*/, "").trim();
  // Email addresses, *재판매 및 DB 금지
  s = s.replace(/\S+@\S+\.\S+/g, "").trim();
  s = s.replace(/\*재판매\s*및\s*DB\s*금지/g, "").trim();
  // (사진 = xxx 제공) 2026.04.27.
  s = s.replace(/\(사진\s*=?\s*[^)]*제공\)\s*\d{4}\.\d{2}\.\d{2}\.?/g, "").trim();
  // Triangle bullet at the very start — common in Korean wires. Just strip
  // the bullet itself; trying to also eat a "source name" is unsafe because
  // that token often is real article content (e.g. duplicated artist name).
  s = s.replace(/^\s*▲\s*/, "").trim();
  return s;
}

/* ── Language detection ────────────────────────────────────────────── */

const SCRIPT_RANGES: Record<Lang, RegExp> = {
  // Hangul syllables + Jamo
  ko: /[ᄀ-ᇿ㄰-㆏ꥠ-꥿가-힯]/g,
  // Hiragana + Katakana + half-width katakana (Kanji is shared with zh, so we
  // require kana for ja detection — pure-Kanji text is treated as zh.)
  ja: /[぀-ゟ゠-ヿｦ-ﾟ]/g,
  // CJK unified ideographs (Kanji/Hanzi). Treated as zh by default.
  zh: /[一-鿿]/g,
  // Basic Latin letters
  en: /[A-Za-z]/g,
};

/** Returns the share (0–1) of `text` characters that fall within `lang`'s
 *  script. Only "letter-like" characters count — whitespace, digits, and
 *  punctuation are ignored to avoid bias from numbers/symbols. */
function scriptShare(text: string, lang: Lang): number {
  const lettersOnly = text.replace(
    /[\s\d.,!?'"()\[\]{}<>~`@#$%^&*\-_=+|/\\:;]/g,
    "",
  );
  if (!lettersOnly) return 0;
  const matches = lettersOnly.match(SCRIPT_RANGES[lang]) ?? [];
  return matches.length / lettersOnly.length;
}

/** True if `text` is "mostly" in `lang`'s script (≥40% of letters). */
export function isMostlyInScript(text: string, lang: Lang): boolean {
  return scriptShare(text, lang) >= 0.4;
}

/** Sanitize and validate a description. Returns cleaned text or null. */
export function sanitizeDescription(
  raw: string | null | undefined,
  options: SanitizeOptions = {},
): string | null {
  if (!raw) return null;
  const { uiLanguage, maxLength = DEFAULT_MAX_LENGTH } = options;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (looksLikeCode(trimmed)) return null;
  if (isGarbled(trimmed)) return null;

  let cleaned = stripEditorialBoilerplate(trimmed);
  if (!cleaned) return null;

  // Re-check after stripping — boilerplate removal can expose code that was
  // tucked behind a byline.
  if (looksLikeCode(cleaned)) return null;

  if (uiLanguage && !isMostlyInScript(cleaned, uiLanguage)) {
    return null;
  }

  if (cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength) + "…";
  }
  return cleaned;
}
