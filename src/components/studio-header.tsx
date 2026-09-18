"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Play, Menu, X, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { LanguageSwitcher } from "@/components/language-switcher";
import { saveLandingScrollPosition } from "@/lib/paywall";

export function StudioHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const t = useTranslations("header");

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/80 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Logo & Name */}
        <Link
          href="/"
          className="flex items-center gap-3 transition-opacity hover:opacity-90 min-h-[44px] cursor-pointer"
          aria-label="Ropoductions Studio Home"
        >
          <Image
            src="/branding/studio-logo.webp"
            alt="Ropoductions Studio Emblem"
            width={36}
            height={36}
            unoptimized
            className="pixelated drop-shadow-[0_0_12px_rgba(34,197,94,0.7)]"
            priority
          />
          <span className="font-display text-xl sm:text-2xl font-bold tracking-wider text-foreground">
            {t("brand")}
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-6">
          <a
            href="#showcase"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground min-h-[44px] inline-flex items-center"
          >
            {t("navShowcase")}
          </a>
          <a
            href="#community"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground min-h-[44px] inline-flex items-center"
          >
            {t("navCommunity")}
          </a>
          <a
            href="https://www.patreon.com/ropoductions"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground min-h-[44px]"
          >
            <span>{t("navPatreon")}</span>
            <ExternalLink className="h-3.5 w-3.5 opacity-70" />
          </a>
        </nav>

        {/* Action Button & Language Switcher & Mobile Toggle */}
        <div className="flex items-center gap-2.5">
          {/* Header Language Switcher */}
          <LanguageSwitcher placement="bottom" />

          <Link
            href="/play"
            scroll={false}
            onClick={saveLandingScrollPosition}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 font-display text-sm font-bold text-primary-foreground shadow-md shadow-primary/20 transition-colors hover:bg-primary-hover min-h-[44px] cursor-pointer"
          >
            <Play className="h-4 w-4 fill-current" />
            <span className="hidden sm:inline">{t("playNow")}</span>
          </Link>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="inline-flex items-center justify-center rounded-lg border border-border bg-card h-11 w-11 shrink-0 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
            aria-label={t("toggleMenu")}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="border-b border-border bg-card px-4 py-4 md:hidden">
          <nav className="flex flex-col space-y-2">
            <a
              href="#showcase"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center px-3 py-2.5 rounded-md text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground min-h-[44px]"
            >
              {t("navShowcase")}
            </a>
            <a
              href="#community"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center px-3 py-2.5 rounded-md text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground min-h-[44px]"
            >
              {t("navCommunity")}
            </a>
            <a
              href="https://www.patreon.com/ropoductions"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-between px-3 py-2.5 rounded-md text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground min-h-[44px]"
            >
              <span>{t("navPatreon")}</span>
              <ExternalLink className="h-4 w-4" />
            </a>
            <div className="pt-2 border-t border-border/60">
              <Link
                href="/play"
                scroll={false}
                onClick={() => {
                  saveLandingScrollPosition();
                  setMobileMenuOpen(false);
                }}
                className="flex items-center justify-center gap-2 w-full rounded-md bg-primary py-3 font-display text-sm font-bold text-primary-foreground min-h-[44px]"
              >
                <Play className="h-4 w-4 fill-current" />
                <span>{t("playNow")}</span>
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
