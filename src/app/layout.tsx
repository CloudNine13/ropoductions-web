import type { Metadata, Viewport } from "next";
import { chakraPetch, geistSans, geistMono } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ropoductions Studio — Adult Indie Games",
  description: "Official web portal and browser client for Ropoductions RPG Maker MZ games.",
  icons: {
    icon: "/branding/studio-logo.webp",
    apple: "/branding/studio-logo.webp",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${chakraPetch.variable} ${geistSans.variable} ${geistMono.variable} dark`}>
      <body className="min-h-screen bg-background text-foreground antialiased font-body selection:bg-primary selection:text-white">
        {children}
      </body>
    </html>
  );
}
