"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Play, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";

const BACKDROP_SLIDES = [
  "/branding/studio-banner.jpeg",
  "/branding/studio-background.jpeg",
];

const SLIDE_INTERVAL_MS = 5000;

export function HeroSection() {
  const t = useTranslations("hero");
  const [activeSlide, setActiveSlide] = useState(0);
  const [backgroundAvailable, setBackgroundAvailable] = useState(true);

  useEffect(() => {
    if (
      !backgroundAvailable ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const id = setInterval(() => {
      setActiveSlide((current) => (current + 1) % BACKDROP_SLIDES.length);
    }, SLIDE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [backgroundAvailable]);

  return (
    <section className="relative isolate w-full overflow-hidden border-b border-border/40 py-16 sm:py-24 lg:py-32 flex items-center justify-center">
      {/* Full-Width Hero Background Key Art Banner & Scrim Overlays */}
      <div className="absolute inset-0 -z-10 w-full h-full pointer-events-none select-none overflow-hidden">
        {/* Key Art Banner (1500x500 3:1) rendered full bleed with retro pixelated scaling */}
        <Image
          src={BACKDROP_SLIDES[0]}
          alt=""
          aria-hidden="true"
          fill
          priority
          className="pixelated object-cover object-center"
          sizes="100vw"
        />

        {/* Alternate studio backdrop crossfading in a slow loop */}
        {backgroundAvailable && (
          <Image
            src={BACKDROP_SLIDES[1]}
            alt=""
            aria-hidden="true"
            fill
            onError={() => setBackgroundAvailable(false)}
            className={`pixelated object-cover object-center transition-opacity duration-[2000ms] ${
              activeSlide === 1 ? "opacity-100" : "opacity-0"
            }`}
            sizes="100vw"
          />
        )}

        {/* Scrim Layer 1: Dark obsidian base tint */}
        <div className="absolute inset-0 bg-background/55" />

        {/* Scrim Layer 2: Targeted center radial scrim muting center banner title while leaving characters bright */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_65%_at_50%_50%,rgba(9,10,15,0.92)_0%,rgba(9,10,15,0.75)_50%,rgba(9,10,15,0.2)_100%)]" />

        {/* Scrim Layer 3: Vertical fade blending seamlessly into sticky header at top and obsidian page at bottom */}
        <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background" />

        {/* Scrim Layer 4: Ambient studio emerald glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_35%,rgba(34,197,94,0.16),transparent_70%)]" />
      </div>
      {/* Hero Foreground Content */}
      <div className="relative z-10 w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-8">
        <div className="flex flex-col items-center justify-center gap-3">
          <div className="flex items-center justify-center gap-3">
            <Image
              src="/branding/studio-logo.webp"
              alt="Ropoductions Studio Emblem"
              width={56}
              height={56}
              unoptimized
              className="pixelated drop-shadow-[0_0_20px_rgba(34,197,94,0.8)]"
              priority
            />
            <h1 className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-wider text-foreground drop-shadow-[0_4px_24px_rgba(0,0,0,0.9)]">
              ROPODUCTIONS
            </h1>
          </div>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-background/80 border border-primary/30 backdrop-blur-md shadow-lg">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
            <span className="font-mono text-xs sm:text-sm tracking-widest text-primary uppercase font-bold">
              {t("studioBadge")}
            </span>
          </div>
        </div>

        {/* Studio Tagline & Lore Intro */}
        <div className="mx-auto max-w-2xl space-y-4">
          <p className="text-base sm:text-xl md:text-2xl text-slate-100 font-body font-medium leading-relaxed drop-shadow-[0_2px_12px_rgba(0,0,0,1)]">
            {t("tagline")}
          </p>
        </div>

        {/* Primary Calls-to-Action & Supported Tiers Indicator */}
        <div className="flex flex-col items-center justify-center gap-4 pt-2">
          <div className="flex flex-wrap items-center justify-center gap-4">
            <div className="px-4 py-2.5 rounded-lg bg-card/85 backdrop-blur-md border border-border/80 text-card-foreground shadow-xl text-sm sm:text-base min-h-[44px] flex items-center">
              {t("supportedTiers")} (<span className="text-tier-gold font-bold ml-1">{t("patronTiers")}</span>)
            </div>

            <Link
              href="/play"
              className="inline-flex items-center justify-center gap-2 px-7 py-3 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground font-display font-bold text-base transition-all min-h-[44px] shadow-lg shadow-primary/25 hover:shadow-primary/40 cursor-pointer"
            >
              <Play className="h-5 w-5 fill-current" />
              {t("playNowPatreon")}
            </Link>

            <a
              href="#showcase"
              className="inline-flex items-center justify-center gap-1.5 px-5 py-3 rounded-lg border border-border/80 bg-card/85 backdrop-blur-md hover:bg-muted text-foreground text-sm font-semibold transition-colors min-h-[44px] cursor-pointer shadow-lg"
            >
              <span>{t("exploreProjects")}</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </a>
          </div>

          <p className="text-xs text-slate-300 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
            {t("patreonRequirements")}
          </p>
        </div>
      </div>
    </section>
  );
}
