import en from "@/locales/en.json";
import es from "@/locales/es.json";
import ru from "@/locales/ru.json";
import pl from "@/locales/pl.json";
import ja from "@/locales/ja.json";
import zh from "@/locales/zh.json";

export const SUPPORTED_LOCALES = ["es", "en", "ru", "pl", "ja", "zh"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export const LANG_COOKIE_NAME = "ropoductions_lang";
export const LANG_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

export interface LocaleInfo {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
}

export const LOCALES: Record<Locale, LocaleInfo> = {
  es: { code: "ES", name: "Spanish", nativeName: "Español", flag: "🇪🇸" },
  en: { code: "EN", name: "English", nativeName: "English", flag: "🇬🇧" },
  ru: { code: "RU", name: "Russian", nativeName: "Русский", flag: "🇷🇺" },
  pl: { code: "PL", name: "Polish", nativeName: "Polski", flag: "🇵🇱" },
  ja: { code: "JA", name: "Japanese", nativeName: "日本語", flag: "🇯🇵" },
  zh: { code: "ZH", name: "Chinese", nativeName: "简体中文", flag: "🇨🇳" },
};

export type Messages = typeof en;

const rawDictionaries: Record<Locale, Messages> = {
  es,
  en,
  ru,
  pl,
  ja,
  zh,
};

export function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = { ...target };
  for (const key of Object.keys(target)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      continue;
    }
    if (Object.hasOwn(source, key)) {
      const targetVal = target[key];
      const sourceVal = source[key];
      if (
        targetVal &&
        typeof targetVal === "object" &&
        !Array.isArray(targetVal) &&
        sourceVal &&
        typeof sourceVal === "object" &&
        !Array.isArray(sourceVal)
      ) {
        output[key] = deepMerge(
          targetVal as Record<string, unknown>,
          sourceVal as Record<string, unknown>
        );
      } else if (
        sourceVal !== undefined &&
        sourceVal !== null &&
        sourceVal !== "" &&
        typeof sourceVal === typeof targetVal
      ) {
        output[key] = sourceVal;
      }
    }
  }
  return output;
}

const memoizedDictionaries: Record<Locale, Messages> = {
  en,
  es: deepMerge(en as unknown as Record<string, unknown>, es as unknown as Record<string, unknown>) as unknown as Messages,
  ru: deepMerge(en as unknown as Record<string, unknown>, ru as unknown as Record<string, unknown>) as unknown as Messages,
  pl: deepMerge(en as unknown as Record<string, unknown>, pl as unknown as Record<string, unknown>) as unknown as Messages,
  ja: deepMerge(en as unknown as Record<string, unknown>, ja as unknown as Record<string, unknown>) as unknown as Messages,
  zh: deepMerge(en as unknown as Record<string, unknown>, zh as unknown as Record<string, unknown>) as unknown as Messages,
};

export function getMessages(locale: Locale): Messages {
  return memoizedDictionaries[locale] ?? en;
}

export function getNestedValue(obj: Record<string, unknown>, path: string): string | undefined {
  const parts = path.split(".");
  let curr: unknown = obj;
  for (const part of parts) {
    if (!curr || typeof curr !== "object") return undefined;
    curr = (curr as Record<string, unknown>)[part];
  }
  return typeof curr === "string" ? curr : undefined;
}

export function getStoredLocale(): Locale {
  if (typeof document === "undefined") {
    return DEFAULT_LOCALE;
  }
  const cookies = document.cookie.split(";");
  for (const cookie of cookies) {
    const [name, rawValue] = cookie.trim().split("=");
    if (name === LANG_COOKIE_NAME && rawValue) {
      const val = rawValue.replace(/^"|"$/g, "").toLowerCase() as Locale;
      if (SUPPORTED_LOCALES.includes(val)) {
        return val;
      }
    }
  }
  return DEFAULT_LOCALE;
}

export function setStoredLocale(locale: Locale): void {
  if (typeof document === "undefined") return;
  if (!SUPPORTED_LOCALES.includes(locale)) return;
  const isSecure = typeof window !== "undefined" && window.location.protocol === "https:";
  const secureFlag = isSecure ? "; Secure" : "";
  document.cookie = `${LANG_COOKIE_NAME}=${locale}; path=/; max-age=${LANG_COOKIE_MAX_AGE}; SameSite=Lax${secureFlag}`;
}
