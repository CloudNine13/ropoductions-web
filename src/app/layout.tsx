import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { chakraPetch, geistSans, geistMono } from "@/lib/fonts";
import { I18nProvider, SUPPORTED_LOCALES, DEFAULT_LOCALE, type Locale, LANG_COOKIE_NAME } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ropoductions Studio — Adult Indie Games",
  description: "Official web portal and browser client for Ropoductions RPG Maker MZ games.",
  icons: {
    icon: [{ url: "/branding/studio-logo.png", type: "image/png", sizes: "72x72" }],
    apple: [{ url: "/branding/studio-logo.png", type: "image/png", sizes: "72x72" }],
  },
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#090A0F",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const rawLang = cookieStore.get(LANG_COOKIE_NAME)?.value?.toLowerCase();
  const initialLocale: Locale =
    rawLang && (SUPPORTED_LOCALES as readonly string[]).includes(rawLang)
      ? (rawLang as Locale)
      : DEFAULT_LOCALE;

  return (
    <html
      lang={initialLocale}
      suppressHydrationWarning
      className={`${chakraPetch.variable} ${geistSans.variable} ${geistMono.variable} dark scroll-smooth`}
    >
      <body className="min-h-screen bg-background text-foreground antialiased font-body selection:bg-primary selection:text-white">
        <I18nProvider initialLocale={initialLocale}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
