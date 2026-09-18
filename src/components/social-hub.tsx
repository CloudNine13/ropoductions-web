"use client";

import { ExternalLink, Lock, MessagesSquare, AtSign } from "lucide-react";
import { useTranslations } from "next-intl";

export function SocialHub() {
  const t = useTranslations("social");

  const channels = [
    {
      name: t("patreonTitle"),
      handle: "ropoductions",
      badge: t("patreonBadge"),
      description: t("patreonDesc"),
      href: "https://www.patreon.com/ropoductions",
      ctaText: t("patreonCta"),
      accentBorder: "hover:border-[#FF424D]",
      accentText: "text-[#FF424D]",
      iconBg: "bg-[#FF424D]/10 text-[#FF424D] border-[#FF424D]/30",
      icon: Lock,
    },
    {
      name: t("discordTitle"),
      handle: "discord.gg/ropoductions",
      badge: t("discordBadge"),
      description: t("discordDesc"),
      href: "https://discord.gg/ropoductions",
      ctaText: t("discordCta"),
      accentBorder: "hover:border-[#5865F2]",
      accentText: "text-[#5865F2]",
      iconBg: "bg-[#5865F2]/10 text-[#5865F2] border-[#5865F2]/30",
      icon: MessagesSquare,
    },
    {
      name: t("twitterTitle"),
      handle: "@Ropoductions",
      badge: t("twitterBadge"),
      description: t("twitterDesc"),
      href: "https://x.com/ropoductions",
      ctaText: t("twitterCta"),
      accentBorder: "hover:border-primary",
      accentText: "text-primary",
      iconBg: "bg-primary/10 text-primary border-primary/30",
      icon: AtSign,
    },
  ];

  return (
    <section id="community" aria-label={t("officialChannels")} className="w-full space-y-12 py-8">
      {/* Heading */}
      <div className="space-y-3 text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("officialChannels")}
        </p>
        <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold tracking-wide text-foreground">
          {t("sectionTitle")}
        </h2>
        <p className="mx-auto max-w-2xl text-sm sm:text-base text-muted-foreground">
          {t("sectionSubtitle")}
        </p>
      </div>

      {/* Grid of 3 Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {channels.map((ch) => {
          const IconComponent = ch.icon;
          return (
            <div
              key={ch.handle}
              className={`flex flex-col justify-between rounded-2xl border border-border bg-card p-6 sm:p-8 transition-colors duration-150 motion-reduce:transition-none shadow-xl ${ch.accentBorder}`}
            >
              <div className="space-y-5">
                {/* Header with Icon and Badge */}
                <div className="flex items-center justify-between">
                  <div className={`inline-flex items-center justify-center rounded-xl border p-3 ${ch.iconBg}`}>
                    <IconComponent className="h-6 w-6" />
                  </div>
                  <span className="rounded-sm bg-background-secondary border border-border px-2.5 py-1 text-[11px] font-bold text-muted-foreground">
                    {ch.badge}
                  </span>
                </div>

                <div>
                  <h3 className="font-display text-xl sm:text-2xl font-bold text-foreground">
                    {ch.name}
                  </h3>
                  <p className={`text-sm font-semibold ${ch.accentText} mt-0.5`}>
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
                  className="inline-flex items-center justify-center gap-2 w-full rounded-lg border border-border bg-background-secondary px-5 py-3 text-sm font-bold text-foreground transition-colors hover:bg-muted hover:border-foreground/30 min-h-[44px] cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
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
