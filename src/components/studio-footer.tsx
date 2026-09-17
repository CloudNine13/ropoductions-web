"use client";

import Image from "next/image";
import Link from "next/link";
import { ExternalLink, ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { LanguageSwitcher } from "@/components/language-switcher";
import { saveLandingScrollPosition } from "@/lib/paywall";

export function StudioFooter() {
  const t = useTranslations("footer");

  return (
    <footer className="w-full border-t border-border bg-background-secondary/80 mt-16">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 space-y-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 border-b border-border/70 pb-8 text-center md:text-left">
          {/* Brand Slot */}
          <div className="flex items-center gap-3">
            <Image
              src="/branding/studio-logo.webp"
              alt="Ropoductions Emblem"
              width={32}
              height={32}
              unoptimized
              className="pixelated drop-shadow-[0_0_8px_rgba(34,197,94,0.5)]"
            />
            <div>
              <span className="font-display text-lg font-bold tracking-wider text-foreground">
                ROPODUCTIONS
              </span>
              <p className="text-xs text-muted-foreground font-mono">
                {t("studioSubtitle")}
              </p>
            </div>
          </div>

          {/* Quick Links & Footer Language Switcher */}
          <div className="flex flex-wrap items-center justify-center gap-6">
            <Link
              href="/"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px] inline-flex items-center"
            >
              {t("navHome")}
            </Link>
            <Link
              href="/play"
              scroll={false}
              onClick={saveLandingScrollPosition}
              className="text-sm text-primary hover:text-primary-hover font-semibold transition-colors min-h-[44px] inline-flex items-center"
            >
              {t("navPlay")}
            </Link>
            <a
              href="#showcase"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px] inline-flex items-center"
            >
              {t("navShowcase")}
            </a>
            <a
              href="#community"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px] inline-flex items-center"
            >
              {t("navCommunity")}
            </a>
            <a
              href="https://www.patreon.com/ropoductions"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px]"
            >
              <span>{t("navPatreon")}</span>
              <ExternalLink className="h-3 w-3" />
            </a>

            {/* Language Switcher in Footer */}
            <div className="inline-flex items-center min-h-[44px]">
              <LanguageSwitcher placement="top" />
            </div>
          </div>
        </div>

        {/* 21+ Compliance Notice & Copyright */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground text-center sm:text-left">
          <div className="flex items-center gap-2 text-foreground/80">
            <ShieldAlert className="h-4 w-4 text-primary shrink-0" />
            <span>
              {t("compliance21")}
            </span>
          </div>

          <p className="font-mono">
            {t("copyright", { year: new Date().getFullYear().toString() })}
          </p>
        </div>
      </div>
    </footer>
  );
}
