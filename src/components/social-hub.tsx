"use client";

import { ExternalLink, Heart, MessageSquare, Sparkles } from "lucide-react";

interface SocialChannel {
  name: string;
  handle: string;
  badge: string;
  description: string;
  href: string;
  ctaText: string;
  accentBorder: string;
  accentText: string;
  iconBg: string;
  icon: typeof Heart;
}

const CHANNELS: SocialChannel[] = [
  {
    name: "Patreon",
    handle: "ropoductions",
    badge: "WEB ACCESS & BUILDS",
    description: "Support Ropoductions on Patreon across active $5–$50 tiers to instantly unlock in-browser web play, early patch builds, and exclusive doujin development logs.",
    href: "https://www.patreon.com/ropoductions",
    ctaText: "Pledge on Patreon",
    accentBorder: "hover:border-[#FF424D]",
    accentText: "text-[#FF424D]",
    iconBg: "bg-[#FF424D]/10 text-[#FF424D] border-[#FF424D]/30",
    icon: Heart,
  },
  {
    name: "Discord",
    handle: "discord.gg/ropoductions",
    badge: "COMMUNITY CHAT",
    description: "Connect with fellow retro RPG enthusiasts, discuss tactical boss strategies, vote on character design polls, and share feedback directly with the development team.",
    href: "https://discord.gg/ropoductions",
    ctaText: "Join Discord Server",
    accentBorder: "hover:border-[#5865F2]",
    accentText: "text-[#5865F2]",
    iconBg: "bg-[#5865F2]/10 text-[#5865F2] border-[#5865F2]/30",
    icon: MessageSquare,
  },
  {
    name: "Twitter / X",
    handle: "@Ropoductions",
    badge: "STUDIO ANNOUNCEMENTS",
    description: "Follow the official studio handle for real-time release announcements, animated pixel art teasers, patch maintenance notices, and behind-the-scenes artwork.",
    href: "https://x.com/ropoductions",
    ctaText: "Follow on Twitter / X",
    accentBorder: "hover:border-primary",
    accentText: "text-primary",
    iconBg: "bg-primary/10 text-primary border-primary/30",
    icon: Sparkles,
  },
];

export function SocialHub() {
  return (
    <section id="community" className="w-full space-y-12 py-8">
      {/* Heading */}
      <div className="space-y-3 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1 text-xs font-semibold uppercase tracking-wider text-foreground/80">
          Official Channels
        </div>
        <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold tracking-wide text-foreground">
          COMMUNITY & SOCIAL HUB
        </h2>
        <p className="mx-auto max-w-2xl text-sm sm:text-base text-muted-foreground">
          Join the Ropoductions network across Patreon, Discord, and Twitter/X to connect with creators and players.
        </p>
      </div>

      {/* Grid of 3 Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {CHANNELS.map((ch) => {
          const IconComponent = ch.icon;
          return (
            <div
              key={ch.name}
              className={`flex flex-col justify-between rounded-2xl border border-border bg-card p-6 sm:p-8 transition-all duration-200 shadow-xl ${ch.accentBorder}`}
            >
              <div className="space-y-5">
                {/* Header with Icon and Badge */}
                <div className="flex items-center justify-between">
                  <div className={`inline-flex items-center justify-center rounded-xl border p-3 ${ch.iconBg}`}>
                    <IconComponent className="h-6 w-6" />
                  </div>
                  <span className="rounded-md bg-background-secondary border border-border px-2.5 py-1 text-[11px] font-bold text-muted-foreground">
                    {ch.badge}
                  </span>
                </div>

                <div>
                  <h3 className="font-display text-xl sm:text-2xl font-bold text-foreground">
                    {ch.name}
                  </h3>
                  <p className={`text-xs font-mono font-semibold ${ch.accentText} mt-0.5`}>
                    {ch.handle}
                  </p>
                </div>

                <p className="text-sm text-muted-foreground leading-relaxed">
                  {ch.description}
                </p>
              </div>

              <div className="pt-6 border-t border-border/60 mt-6">
                <a
                  href={ch.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 w-full rounded-lg border border-border bg-background-secondary px-5 py-3 text-sm font-bold text-foreground transition-colors hover:bg-muted hover:border-foreground/30 min-h-[44px] cursor-pointer"
                  aria-label={`${ch.ctaText} (opens in new tab)`}
                >
                  <span>{ch.ctaText}</span>
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
