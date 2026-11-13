import { detectLang } from "./i18n";
import { isTauri, readStore, writeStore } from "./tauri";

export type VoiceMode = "local" | "system" | "off";

export interface Settings {
  name: string;
  lang: string;
  voice: VoiceMode;
  wake: boolean;
  overlay: boolean;
  model: string;
  apiKey: string;
  ttsServer: string;
}

export const MODELS = {
  free: "deepseek-v4.1-flash:free",
  paid: "deepseek-v4.1-flash",
} as const;

export const DEFAULTS: Settings = {
  name: "",
  lang: detectLang(),
  voice: "local",
  wake: false,
  overlay: false,
  model: MODELS.free,
  apiKey: "",
  ttsServer: import.meta.env.VITE_TTS_SERVER || "http://127.0.0.1:8765",
};

const SETTINGS_KEY = "synt.settings.v1";
const SECRET_KEY = "synt.secret.v1";

/**
 * Settings live in localStorage (browser shell) or in the app's own data
 * folder through Rust (desktop/Android). The key is a separate slot so it can
 * be cleared without touching the rest.
 *
 * In Tauri the file is written 0600 on Unix. It is a local file, not a
 * keychain: the README says so, and the island never displays the key again
 * after saving.
 */
export async function loadSettings(): Promise<Settings> {
  const raw = (await readStore("settings")) ?? localStorage.getItem(SETTINGS_KEY);
  let parsed: Partial<Settings> = {};
  if (raw) {
    try {
      parsed = JSON.parse(raw) as Partial<Settings>;
    } catch {
      parsed = {};
    }
  }
  const merged: Settings = { ...DEFAULTS, ...parsed };
  if (!parsed.lang) merged.lang = detectLang();
  if (import.meta.env.VITE_MODEL) merged.model = import.meta.env.VITE_MODEL;
  return merged;
}

export async function saveSettings(settings: Settings): Promise<void> {
  const raw = JSON.stringify(settings);
  localStorage.setItem(SETTINGS_KEY, raw);
  if (isTauri()) await writeStore("settings", raw);
}

export async function loadKey(): Promise<string> {
  if (import.meta.env.VITE_TOKENHARBOR_KEY) return import.meta.env.VITE_TOKENHARBOR_KEY;
  const raw = (await readStore("secret")) ?? localStorage.getItem(SECRET_KEY);
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as { tokenharbor?: string };
    return parsed.tokenharbor ?? "";
  } catch {
    return "";
  }
}

export async function saveKey(key: string): Promise<void> {
  const raw = JSON.stringify({ tokenharbor: key });
  localStorage.setItem(SECRET_KEY, raw);
  if (isTauri()) await writeStore("secret", raw);
}

export async function clearKey(): Promise<void> {
  localStorage.removeItem(SECRET_KEY);
  if (isTauri()) await writeStore("secret", "{}");
}

export function greetingName(settings: Settings): string {
  return settings.name.trim();
}
