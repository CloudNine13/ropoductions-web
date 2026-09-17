"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { Play, Sparkles, Maximize2, Shield, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { ScreenshotLightbox, type ScreenshotItem } from "@/components/screenshot-lightbox";
import { saveLandingScrollPosition } from "@/lib/paywall";

export function ProjectShowcase() {
  const t = useTranslations("showcase");
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [activeScreenshotIndex, setActiveScreenshotIndex] = useState(0);

  const screenshots: ScreenshotItem[] = useMemo(
    () => [
      {
        id: "title",
        src: "/media/screenshots/fo-title.svg",
        alt: t("screenshots.title.title"),
        title: t("screenshots.title.title"),
        caption: t("screenshots.title.caption"),
        badge: t("screenshots.title.badge"),
      },
      {
        id: "dungeon",
        src: "/media/screenshots/fo-dungeon.svg",
        alt: t("screenshots.dungeon.title"),
        title: t("screenshots.dungeon.title"),
        caption: t("screenshots.dungeon.caption"),
        badge: t("screenshots.dungeon.badge"),
      },
      {
        id: "battle",
        src: "/media/screenshots/fo-battle.svg",
        alt: t("screenshots.battle.title"),
        title: t("screenshots.battle.title"),
        caption: t("screenshots.battle.caption"),
        badge: t("screenshots.battle.badge"),
      },
      {
        id: "dialogue",
        src: "/media/screenshots/fo-dialogue.svg",
        alt: t("screenshots.dialogue.title"),
        title: t("screenshots.dialogue.title"),
        caption: t("screenshots.dialogue.caption"),
        badge: t("screenshots.dialogue.badge"),
      },
    ],
    [t]
  );

  const characters = useMemo(
    () => [
      {
        id: "lyra",
        name: t("characters.lyra.name"),
        role: t("characters.lyra.role"),
        archetype: t("characters.lyra.archetype"),
        description: t("characters.lyra.description"),
        portrait: "/media/characters/char-lyra.svg",
        badge: t("characters.lyra.badge"),
      },
      {
        id: "kael",
        name: t("characters.kael.name"),
        role: t("characters.kael.role"),
        archetype: t("characters.kael.archetype"),
        description: t("characters.kael.description"),
        portrait: "/media/characters/char-kael.svg",
        badge: t("characters.kael.badge"),
      },
      {
        id: "morgana",
        name: t("characters.morgana.name"),
        role: t("characters.morgana.role"),
        archetype: t("characters.morgana.archetype"),
        description: t("characters.morgana.description"),
        portrait: "/media/characters/char-morgana.svg",
        badge: t("characters.morgana.badge"),
      },
      {
        id: "goruk",
        name: t("characters.goruk.name"),
        role: t("characters.goruk.role"),
        archetype: t("characters.goruk.archetype"),
        description: t("characters.goruk.description"),
        portrait: "/media/characters/char-goruk.svg",
        badge: t("characters.goruk.badge"),
      },
    ],
    [t]
  );

  const openLightbox = (index: number) => {
    setActiveScreenshotIndex(index);
    setLightboxOpen(true);
  };

  return (
    <section id="showcase" className="w-full space-y-16 py-8">
      {/* Section Sub-heading */}
      <div className="space-y-3 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          {t("prestigeBadge")}
        </div>
        <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold tracking-wide text-foreground">
          {t("sectionTitle")}
        </h2>
        <p className="mx-auto max-w-2xl text-sm sm:text-base text-muted-foreground">
          {t("sectionSubtitle")}
        </p>
      </div>

      {/* Featured Title 1: Final Orginity */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 sm:p-8 md:p-10 shadow-xl space-y-10">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 border-b border-border/70 pb-8">
          <div className="space-y-4 max-w-3xl">
            {/* Badges */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-primary/15 border border-primary/40 px-3 py-1 text-xs font-bold text-primary">
                {t("badgeRpgMaker")}
              </span>
              <span className="rounded-md bg-card border border-border px-3 py-1 text-xs font-semibold text-card-foreground">
                {t("badgeHtml5")}
              </span>
              <span className="rounded-md bg-accent/15 border border-accent/40 px-3 py-1 text-xs font-semibold text-accent">
                {t("badgeActiveChapter")}
              </span>
              <span className="rounded-md bg-tier-gold/15 border border-tier-gold/40 px-3 py-1 text-xs font-semibold text-tier-gold">
                {t("badgePatronAccess")}
              </span>
            </div>

            {/* Game Title & Lore Teaser */}
            <h3 className="font-display text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-wide text-foreground">
              {t("titleFinalOrginity")}
            </h3>
            <p className="text-base sm:text-lg text-foreground/90 font-medium">
              {t("foTagline")}
            </p>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              {t("foDescription")}
            </p>
          </div>

          {/* Action Button */}
          <div className="flex flex-col sm:flex-row lg:flex-col gap-3 min-w-[220px]">
            <Link
              href="/play"
              scroll={false}
              onClick={saveLandingScrollPosition}
              className="inline-flex items-center justify-center gap-2.5 rounded-lg bg-primary px-6 py-3.5 font-display text-base font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary-hover hover:shadow-primary/40 min-h-[48px] cursor-pointer"
            >
              <Play className="h-5 w-5 fill-current" />
              {t("playInBrowser")}
            </Link>
            <span className="text-xs text-center text-muted-foreground">
              {t("verifiedPatronHint")}
            </span>
          </div>
        </div>

        {/* Characters Grid */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 border-b border-border/50 pb-3">
            <Users className="h-5 w-5 text-primary" />
            <h4 className="font-display text-lg sm:text-xl font-bold text-foreground">
              {t("partySectionTitle")}
            </h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {characters.map((char) => (
              <div
                key={char.id}
                className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-background-secondary/70 p-4 transition-all duration-200 hover:border-primary/50 hover:bg-background-secondary shadow-md"
              >
                <div className="relative aspect-[4/5] w-full overflow-hidden rounded-lg bg-card border border-border/60">
                  <Image
                    src={char.portrait}
                    alt={`${char.name} - ${char.role}`}
                    fill
                    unoptimized
                    className="pixelated object-cover transition-transform duration-300 group-hover:scale-105"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                  />
                  <div className="absolute top-2 left-2 rounded bg-card/90 backdrop-blur-sm border border-border/80 px-2 py-0.5 text-[10px] font-bold text-tier-gold">
                    {char.badge}
                  </div>
                </div>

                <div className="mt-4 flex-1 flex flex-col justify-between space-y-2">
                  <div>
                    <h5 className="font-display text-base font-bold text-foreground">
                      {char.name}
                    </h5>
                    <p className="text-xs font-semibold text-primary">
                      {char.role} &bull; {char.archetype}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground/90 leading-relaxed">
                    {char.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Screenshot Gallery */}
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-border/50 pb-3">
            <div className="flex items-center gap-2">
              <Maximize2 className="h-5 w-5 text-primary" />
              <h4 className="font-display text-lg sm:text-xl font-bold text-foreground">
                {t("screenshotsSectionTitle")}
              </h4>
            </div>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {t("clickToExpandHint")}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {screenshots.map((shot, idx) => (
              <button
                key={shot.id}
                type="button"
                onClick={() => openLightbox(idx)}
                className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-background-secondary/60 text-left transition-all duration-200 hover:border-primary hover:shadow-lg hover:shadow-primary/10 min-h-[44px] cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary"
                aria-label={`Open full screenshot preview: ${shot.title}`}
              >
                <div className="relative aspect-[16/9] w-full overflow-hidden bg-background">
                  <Image
                    src={shot.src}
                    alt={shot.alt}
                    fill
                    unoptimized
                    className="pixelated object-cover transition-transform duration-300 group-hover:scale-105"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                    <div className="flex items-center gap-1.5 rounded-md bg-card/90 px-3 py-1.5 text-xs font-bold text-primary border border-primary/40 shadow">
                      <Maximize2 className="h-3.5 w-3.5" />
                      {t("expandScreenshot")}
                    </div>
                  </div>
                  {shot.badge && (
                    <div className="absolute top-2 left-2 rounded bg-card/90 px-2 py-0.5 text-[10px] font-bold text-foreground border border-border">
                      {shot.badge}
                    </div>
                  )}
                </div>

                <div className="p-3">
                  <h5 className="font-display text-xs sm:text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                    {shot.title}
                  </h5>
                  <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground leading-snug">
                    {shot.caption}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Featured Title 2: Upcoming Godot Project */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 sm:p-8 md:p-10 shadow-xl space-y-6">
        <div className="flex flex-col lg:flex-row gap-8 items-center">
          <div className="relative aspect-[16/9] w-full lg:w-1/2 overflow-hidden rounded-xl border border-border bg-background">
            <Image
              src="/media/projects/godot-teaser.svg"
              alt="Project Orginity 2: The Fallen Citadel Teaser"
              fill
              unoptimized
              className="pixelated object-cover"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
          </div>

          <div className="w-full lg:w-1/2 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-accent/20 border border-accent/60 px-3 py-1 text-xs font-extrabold text-accent">
                {t("godotBadgeComingSoon")}
              </span>
              <span className="rounded-md bg-card border border-border px-3 py-1 text-xs font-semibold text-card-foreground">
                {t("godotBadgeEngine")}
              </span>
              <span className="rounded-md bg-muted border border-border px-3 py-1 text-xs font-semibold text-muted-foreground">
                {t("godotBadgeDesktop")}
              </span>
            </div>

            <h3 className="font-display text-2xl sm:text-3xl font-extrabold tracking-wide text-foreground">
              {t("godotTitle")}
            </h3>

            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              {t("godotDescription")}
            </p>

            <div className="pt-2">
              <div className="inline-flex items-center gap-2 rounded-md bg-muted/50 border border-border px-4 py-2.5 text-xs text-muted-foreground">
                <Shield className="h-4 w-4 text-accent" />
                {t("godotStatusNote")}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox Modal */}
      <ScreenshotLightbox
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        screenshots={screenshots}
        currentIndex={activeScreenshotIndex}
        onNavigate={(idx) => setActiveScreenshotIndex(idx)}
      />
    </section>
  );
}
