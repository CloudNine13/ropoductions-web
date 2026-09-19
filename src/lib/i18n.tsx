"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { NextIntlClientProvider } from "next-intl";

import {
  SUPPORTED_LOCALES,
  LOCALES,
  getMessages,
  getStoredLocale,
  setStoredLocale,
  getNestedValue,
  type Locale,
  type LocaleInfo,
  type Messages,
} from "./i18n-config";

export const LANG_COOKIE_NAME = "ropoductions_lang";
export const LANG_COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 365 days in seconds
export const DEFAULT_LOCALE: Locale = "en";

export {
  SUPPORTED_LOCALES,
  LOCALES,
  getMessages,
  getStoredLocale,
  setStoredLocale,
  getNestedValue,
  type Locale,
  type LocaleInfo,
  type Messages,
};

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
    if (stored !== initialLocale) {
      // Hydrating the persisted locale after mount; a lazy initializer would
      // read `document` during SSR and mismatch server-rendered markup.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocaleState(stored);
      document.documentElement.lang = stored;
    }
  }, [initialLocale]);

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
          const enDict = getMessages("en");
          return getNestedValue(enDict as unknown as Record<string, unknown>, path) || key;
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
