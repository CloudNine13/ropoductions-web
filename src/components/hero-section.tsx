"use client";

import Image from "next/image";
import Link from "next/link";
import { Play, ChevronDown } from "lucide-react";

export function HeroSection() {
  return (
    <section className="relative w-full pt-6 pb-12 sm:pt-10 sm:pb-16 text-center space-y-8">
      {/* Studio Brand Mark Header */}
      <div className="flex flex-col items-center justify-center gap-3">
        <div className="flex items-center justify-center gap-3">
          <Image
            src="/branding/studio-logo.webp"
            alt="Ropoductions Studio Emblem"
            width={48}
            height={48}
            unoptimized
            className="pixelated drop-shadow-[0_0_16px_rgba(34,197,94,0.7)]"
            priority
          />
          <h1 className="font-display text-3xl sm:text-4xl md:text-6xl font-extrabold tracking-wider text-foreground">
            ROPODUCTIONS
          </h1>
        </div>
        <p className="font-mono text-xs sm:text-sm tracking-widest text-primary uppercase font-semibold">
          Independent Adult Game Studio
        </p>
      </div>

      {/* Hero Visual: 1500x500 Key Art Banner (3:1 Aspect Ratio) */}
      <div className="relative mx-auto w-full max-w-5xl overflow-hidden rounded-2xl border border-border bg-card shadow-[0_0_50px_rgba(34,197,94,0.15)]">
        <div className="relative aspect-[3/1] w-full">
          <Image
            src="/branding/studio-banner.jpeg"
            alt="Final Orginity - Ropoductions Key Art Banner"
            fill
            className="pixelated object-cover"
            priority
            sizes="(max-width: 1280px) 100vw, 1024px"
          />
          {/* Subtle dark vignette gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-background/60 via-transparent to-transparent pointer-events-none" />
        </div>
      </div>

      {/* Studio Tagline & Lore Intro */}
      <div className="mx-auto max-w-2xl space-y-4">
        <p className="text-base sm:text-xl text-muted-foreground font-body leading-relaxed">
          Crafting cheeky, narrative-driven retro anime RPGs and pixel adventures for mature audiences.
        </p>
      </div>

      {/* Primary Calls-to-Action & Supported Tiers Indicator */}
      <div className="flex flex-col items-center justify-center gap-4 pt-2">
        <div className="flex flex-wrap items-center justify-center gap-4">
          <div className="px-4 py-2.5 rounded-lg bg-card border border-border text-card-foreground shadow-lg text-sm sm:text-base min-h-[44px] flex items-center">
            Supported Tiers (<span className="text-tier-gold font-bold ml-1">$5–$50 Patrons</span>)
          </div>

          <Link
            href="/play"
            className="inline-flex items-center justify-center gap-2 px-7 py-3 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground font-display font-bold text-base transition-all min-h-[44px] shadow-lg shadow-primary/25 hover:shadow-primary/40 cursor-pointer"
          >
            <Play className="h-5 w-5 fill-current" />
            Play Now with Patreon
          </Link>

          <a
            href="#showcase"
            className="inline-flex items-center justify-center gap-1.5 px-5 py-3 rounded-lg border border-border bg-card hover:bg-muted text-foreground text-sm font-semibold transition-colors min-h-[44px] cursor-pointer"
          >
            <span>Explore Projects</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </a>
        </div>

        <p className="text-xs text-muted-foreground">
          Requires 21+ age confirmation and active Patreon campaign membership ($5+ tier).
        </p>
      </div>
    </section>
  );
}
