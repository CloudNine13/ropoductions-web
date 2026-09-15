import type { Metadata, Viewport } from "next";
import { cinzel, geistSans, geistMono } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ropoductions Studio — Adult Indie Games",
  description: "Official web portal and browser client for Ropoductions RPG Maker MZ games.",
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
    <html lang="en" className={`${cinzel.variable} ${geistSans.variable} ${geistMono.variable} dark`}>
      <body className="min-h-screen bg-background text-foreground antialiased font-body selection:bg-primary selection:text-white">
        {children}
      </body>
    </html>
  );
}
