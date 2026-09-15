"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { NextIntlClientProvider } from "next-intl";

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
export const LANG_COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 365 days in seconds

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

/**
 * Deep merges non-English dictionary onto English base dictionary
 * ensuring all missing keys fall back gracefully to English.
 */
function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = { ...target };
  for (const key of Object.keys(target)) {
    if (key in source) {
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
      } else if (sourceVal !== undefined && sourceVal !== null && sourceVal !== "") {
        output[key] = sourceVal;
      }
    }
  }
  return output;
}

/**
 * Retrieves merged messages for a given locale with English fallback.
 */
export function getMessages(locale: Locale): Messages {
  if (locale === "en") return en;
  const dict = rawDictionaries[locale] as unknown as Record<string, unknown>;
  if (!dict) return en;
  return deepMerge(en as unknown as Record<string, unknown>, dict) as unknown as Messages;
}

function getNestedValue(obj: Record<string, unknown>, path: string): string | undefined {
  const parts = path.split(".");
  let curr: unknown = obj;
  for (const part of parts) {
    if (!curr || typeof curr !== "object") return undefined;
    curr = (curr as Record<string, unknown>)[part];
  }
  return typeof curr === "string" ? curr : undefined;
}

/**
 * Parses the `ropoductions_lang` cookie from document.cookie.
 */
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

/**
 * Sets the 365-day persistent `ropoductions_lang` cookie.
 */
export function setStoredLocale(locale: Locale): void {
  if (typeof document === "undefined") return;
  const isSecure = typeof window !== "undefined" && window.location.protocol === "https:";
  const secureFlag = isSecure ? "; Secure" : "";
  document.cookie = `${LANG_COOKIE_NAME}=${locale}; path=/; max-age=${LANG_COOKIE_MAX_AGE}; SameSite=Lax${secureFlag}`;
}

interface I18nContextType {
  locale: Locale;
  setLocale: (next: Locale) => void;
  locales: typeof LOCALES;
}

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({
  children,
  initialLocale = DEFAULT_LOCALE,
}: {
  children: React.ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  useEffect(() => {
    const stored = getStoredLocale();
    if (stored !== locale) {
      setLocaleState(stored);
      document.documentElement.lang = stored;
    }
  }, []);

  const setLocale = useCallback((nextLocale: Locale) => {
    if (!SUPPORTED_LOCALES.includes(nextLocale)) return;
    setLocaleState(nextLocale);
    setStoredLocale(nextLocale);
    if (typeof document !== "undefined") {
      document.documentElement.lang = nextLocale;
    }
  }, []);

  const messages = useMemo(() => getMessages(locale), [locale]);

  const contextValue = useMemo(
    () => ({
      locale,
      setLocale,
      locales: LOCALES,
    }),
    [locale, setLocale]
  );

  return (
    <I18nContext.Provider value={contextValue}>
      <NextIntlClientProvider
        locale={locale}
        messages={messages}
        timeZone="UTC"
        onError={() => {
          // Suppress missing translation warnings in production
        }}
        getMessageFallback={({ key, namespace }) => {
          const path = namespace ? `${namespace}.${key}` : key;
          return getNestedValue(en as unknown as Record<string, unknown>, path) || key;
        }}
      >
        {children}
      </NextIntlClientProvider>
    </I18nContext.Provider>
  );
}

export function useLocaleSwitcher() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useLocaleSwitcher must be used within an I18nProvider");
  }
  return context;
}
