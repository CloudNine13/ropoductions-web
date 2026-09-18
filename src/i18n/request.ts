import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  LANG_COOKIE_NAME,
  getMessages,
  type Locale,
} from "@/lib/i18n-config";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const rawLocale = cookieStore.get(LANG_COOKIE_NAME)?.value?.toLowerCase();
  const locale: Locale =
    rawLocale && (SUPPORTED_LOCALES as readonly string[]).includes(rawLocale)
      ? (rawLocale as Locale)
      : DEFAULT_LOCALE;

  return {
    locale,
    messages: getMessages(locale),
  };
});
