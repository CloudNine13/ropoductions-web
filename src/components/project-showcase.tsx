"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Play, Sparkles, Maximize2, Shield, Users } from "lucide-react";
import { ScreenshotLightbox, type ScreenshotItem } from "@/components/screenshot-lightbox";

const SCREENSHOTS: ScreenshotItem[] = [
  {
    id: "title",
    src: "/media/screenshots/fo-title.svg",
    alt: "Final Orginity Title Screen",
    title: "Title Screen & Main Menu",
    caption: "Official Title Screen: nostalgic pixel sunset, CRT aesthetic, and direct web save management.",
    badge: "TITLE SCREEN",
  },
  {
    id: "dungeon",
    src: "/media/screenshots/fo-dungeon.svg",
    alt: "Dungeon Exploration & Vaults",
    title: "Labyrinth Exploration",
    caption: "The Lower Crypts: atmospheric dungeon exploration featuring ambient torches, secret vault doors, and 16-bit party sprites.",
    badge: "EXPLORATION",
  },
  {
    id: "battle",
    src: "/media/screenshots/fo-battle.svg",
    alt: "Tactical Turn-Based Combat",
    title: "Side-View Turn-Based Combat",
    caption: "Archdemon Malakor encounter: classic side-view battles with dynamic TP meters, tactical spell command windows, and boss mechanics.",
    badge: "COMBAT",
  },
  {
    id: "dialogue",
    src: "/media/screenshots/fo-dialogue.svg",
    alt: "Branching Dialogue & Character Encounters",
    title: "Doujin Narrative Cutscenes",
    caption: "Lyra the Sybarite dialogue cutscene: detailed anime character portraits, glowing nameplates, and cheeky doujin storytelling.",
    badge: "NARRATIVE",
  },
];

interface Character {
  name: string;
  role: string;
  archetype: string;
  description: string;
  portrait: string;
  badge: string;
}

const CHARACTERS: Character[] = [
  {
    name: "Lyra",
    role: "High-Elf Sybarite",
    archetype: "Arcane Archer",
    description: "Hedonistic marksman who wields enchanted emerald arrows with sensual nonchalance and lethal precision.",
    portrait: "/media/characters/char-lyra.svg",
    badge: "ELF SYBARITE",
  },
  {
    name: "Kael",
    role: "Crimson Vagabond",
    archetype: "Exiled Blademaster",
    description: "Cynical sellsword armed with dual shortswords, driven by a sharp tongue and an instinct for survival.",
    portrait: "/media/characters/char-kael.svg",
    badge: "BLADEMASTER",
  },
  {
    name: "Morgana",
    role: "Shadowweaver",
    archetype: "Void Enchantress",
    description: "Forbidden mystic who weaves astral shadows and eldritch charms to warp enemy formations.",
    portrait: "/media/characters/char-morgana.svg",
    badge: "VOID ENCHANTRESS",
  },
  {
    name: "Goruk",
    role: "Ironhide",
    archetype: "Ork Juggernaut",
    description: "Brawny powerhouse who shields the party from heavy assaults while crushing foes with unyielding fury.",
    portrait: "/media/characters/char-goruk.svg",
    badge: "ORK PROTECTOR",
  },
];

export function ProjectShowcase() {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [activeScreenshotIndex, setActiveScreenshotIndex] = useState(0);

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
          Prestige Adult Indie Games
        </div>
        <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold tracking-wide text-foreground">
          PROJECT SHOWCASE
        </h2>
        <p className="mx-auto max-w-2xl text-sm sm:text-base text-muted-foreground">
          Explore Ropoductions’ active browser RPG and preview upcoming standalone releases.
        </p>
      </div>

      {/* Featured Title 1: Final Orginity */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 sm:p-8 md:p-10 shadow-xl space-y-10">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 border-b border-border/70 pb-8">
          <div className="space-y-4 max-w-3xl">
            {/* Badges */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-primary/15 border border-primary/40 px-3 py-1 text-xs font-bold text-primary">
                RPG MAKER MZ
              </span>
              <span className="rounded-md bg-card border border-border px-3 py-1 text-xs font-semibold text-card-foreground">
                HTML5 WEB CLIENT
              </span>
              <span className="rounded-md bg-accent/15 border border-accent/40 px-3 py-1 text-xs font-semibold text-accent">
                ACTIVE CHAPTER
              </span>
              <span className="rounded-md bg-tier-gold/15 border border-tier-gold/40 px-3 py-1 text-xs font-semibold text-tier-gold">
                PATRON ACCESS ($5–$50)
              </span>
            </div>

            {/* Game Title & Lore Teaser */}
            <h3 className="font-display text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-wide text-foreground">
              FINAL ORGINITY
            </h3>
            <p className="text-base sm:text-lg text-foreground/90 font-medium">
              A cheeky, narrative-driven fantasy RPG packed with classic turn-based tactics, doujin charm, and erotic comedy.
            </p>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              Descend into a cheeky fantasy labyrinth where perilous dungeon vaults meet provocative character encounters. Lead an eclectic party of exiled rogues, hedonistic elven archers, and void enchantresses as you break the Sanctum Seals. Playable directly in your browser with zero installation and seamless save backup persistence.
            </p>
          </div>

          {/* Action Button */}
          <div className="flex flex-col sm:flex-row lg:flex-col gap-3 min-w-[220px]">
            <Link
              href="/play"
              className="inline-flex items-center justify-center gap-2.5 rounded-lg bg-primary px-6 py-3.5 font-display text-base font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary-hover hover:shadow-primary/40 min-h-[48px] cursor-pointer"
            >
              <Play className="h-5 w-5 fill-current" />
              Play in Browser
            </Link>
            <span className="text-xs text-center text-muted-foreground">
              Verified 21+ & Active $5+ Patreon
            </span>
          </div>
        </div>

        {/* Characters Grid */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 border-b border-border/50 pb-3">
            <Users className="h-5 w-5 text-primary" />
            <h4 className="font-display text-lg sm:text-xl font-bold text-foreground">
              PARTY MEMBERS & COMPANIONS
            </h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {CHARACTERS.map((char) => (
              <div
                key={char.name}
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
                IN-GAME SCREENSHOT GALLERY
              </h4>
            </div>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Click any screenshot to view in full lightbox
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {SCREENSHOTS.map((shot, idx) => (
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
                      Expand
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
                COMING SOON
              </span>
              <span className="rounded-md bg-card border border-border px-3 py-1 text-xs font-semibold text-card-foreground">
                GODOT 4 ENGINE
              </span>
              <span className="rounded-md bg-muted border border-border px-3 py-1 text-xs font-semibold text-muted-foreground">
                DESKTOP STANDALONE
              </span>
            </div>

            <h3 className="font-display text-2xl sm:text-3xl font-extrabold tracking-wide text-foreground">
              PROJECT ORGINITY 2: THE FALLEN CITADEL
            </h3>

            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              The next ambitious evolution in the Ropoductions universe. Rebuilt from the ground up in the Godot 4 engine with high-framerate pixel art animations, expanded party combat systems, and a sprawling open-world narrative. Desktop standalone builds for PC, Mac, and Linux will be distributed exclusively to active patrons.
            </p>

            <div className="pt-2">
              <div className="inline-flex items-center gap-2 rounded-md bg-muted/50 border border-border px-4 py-2.5 text-xs text-muted-foreground">
                <Shield className="h-4 w-4 text-accent" />
                Status: In active development • Download mirrors will be provided for studio patrons upon release.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox Modal */}
      <ScreenshotLightbox
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        screenshots={SCREENSHOTS}
        currentIndex={activeScreenshotIndex}
        onNavigate={(idx) => setActiveScreenshotIndex(idx)}
      />
    </section>
  );
}
