import { LOCALES, en, type StringKey } from "./locales";

export interface LangMeta {
  code: string;
  label: string;
  bcp47: string;
  rtl?: boolean;
}

/** Same sixteen languages as coucou, and the same native labels. */
export const LANGS: LangMeta[] = [
  { code: "en", label: "English", bcp47: "en-US" },
  { code: "zh-CN", label: "简体中文", bcp47: "zh-CN" },
  { code: "zh-TW", label: "繁體中文", bcp47: "zh-TW" },
  { code: "hi", label: "हिन्दी", bcp47: "hi-IN" },
  { code: "es", label: "Español", bcp47: "es-ES" },
  { code: "ar", label: "العربية", bcp47: "ar-SA", rtl: true },
  { code: "fr", label: "Français", bcp47: "fr-FR" },
  { code: "bn", label: "বাংলা", bcp47: "bn-BD" },
  { code: "pt", label: "Português", bcp47: "pt-BR" },
  { code: "ru", label: "Русский", bcp47: "ru-RU" },
  { code: "id", label: "Bahasa Indonesia", bcp47: "id-ID" },
  { code: "de", label: "Deutsch", bcp47: "de-DE" },
  { code: "tr", label: "Türkçe", bcp47: "tr-TR" },
  { code: "th", label: "ไทย", bcp47: "th-TH" },
  { code: "ko", label: "한국어", bcp47: "ko-KR" },
  { code: "ja", label: "日本語", bcp47: "ja-JP" },
];

const byCode = new Map(LANGS.map((l) => [l.code, l]));

export function langMeta(code: string): LangMeta {
  return byCode.get(code) ?? LANGS[0];
}

/** Follow the system language when it is one we speak, English otherwise. */
export function detectLang(): string {
  const candidates = [navigator.language, ...(navigator.languages ?? [])];
  for (const raw of candidates) {
    if (!raw) continue;
    const lower = raw.toLowerCase();
    const exact = LANGS.find((l) => l.code.toLowerCase() === lower);
    if (exact) return exact.code;
    const base = lower.split("-")[0];
    const loose = LANGS.find((l) => l.code.toLowerCase().split("-")[0] === base);
    if (loose) {
      // Simplified Chinese is the safer default for a bare `zh`.
      if (base === "zh") return "zh-CN";
      return loose.code;
    }
  }
  return "en";
}

let current = "en";

export function setLang(code: string): void {
  current = byCode.has(code) ? code : "en";
  const meta = langMeta(current);
  document.documentElement.lang = meta.code;
  document.documentElement.dir = meta.rtl ? "rtl" : "ltr";
}

export function getLang(): string {
  return current;
}

export function getBcp47(): string {
  return langMeta(current).bcp47;
}

type Vars = Record<string, string | number>;

/** Look up a key, fill {placeholders}, and never return a blank string. */
export function t(key: StringKey, vars?: Vars): string {
  const dict = LOCALES[current as keyof typeof LOCALES] as Partial<Record<StringKey, string>> | undefined;
  let out = dict?.[key] ?? en[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      out = out.replaceAll(`{${name}}`, String(value));
    }
  }
  return out;
}

export function languageName(code: string): string {
  return langMeta(code).label;
}
