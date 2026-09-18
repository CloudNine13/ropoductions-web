import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  LANG_COOKIE_NAME,
  getMessages,
  type Locale,
} from "@/lib/i18n-config";

export default getRequestConfig(async ({ requestLocale }) => {
  const explicit = await requestLocale;
  const cookieStore = await cookies();
  const rawValue = cookieStore.get(LANG_COOKIE_NAME)?.value;
  const rawLocale = rawValue?.replace(/^"|"$/g, "").trim().toLowerCase();
  const candidate =
    explicit && (SUPPORTED_LOCALES as readonly string[]).includes(explicit)
      ? explicit
      : rawLocale;
  const locale: Locale =
    candidate && (SUPPORTED_LOCALES as readonly string[]).includes(candidate)
      ? (candidate as Locale)
      : DEFAULT_LOCALE;

  return {
    locale,
    messages: getMessages(locale),
  };
});
