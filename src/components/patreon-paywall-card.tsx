"use client";

import { Lock, ExternalLink, ShieldCheck, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  PATREON_LOGIN_HREF,
  PAYWALL_CAMPAIGN_URL,
  PAYWALL_TIERS,
} from "@/lib/paywall";

interface PatreonPaywallCardProps {
  campaignUrl?: string;
  className?: string;
}

export function PatreonPaywallCard({
  campaignUrl = PAYWALL_CAMPAIGN_URL,
  className = "",
}: PatreonPaywallCardProps) {
  const t = useTranslations("paywall");

  const tiers = PAYWALL_TIERS.map((tier) => ({
    ...tier,
    name: t(tier.nameKey),
    desc: t(tier.descKey),
  }));

  return (
    <div
      className={`w-full max-w-2xl mx-auto rounded-2xl border border-border/80 bg-card/95 backdrop-blur-md p-5 sm:p-6 shadow-2xl shadow-black/80 space-y-5 sm:space-y-6 ${className}`}
    >
      <div className="flex flex-col items-center text-center space-y-2.5">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 border border-accent/40 shadow-[0_0_24px_rgba(251,191,36,0.25)]">
          <Lock className="h-6 w-6 text-accent" aria-hidden="true" />
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-mono tracking-wide text-accent">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{t("badge")}</span>
        </div>
        <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-foreground">
          {t("title")}
        </h2>
        <p className="text-sm sm:text-base text-muted-foreground max-w-lg">
          {t("subtitle")}
        </p>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {tiers.map((tier, idx) => (
            <div
              key={tier.id}
              className={`rounded-xl border border-border/60 bg-background/60 p-4 transition-colors hover:border-accent/40 ${
                idx === 4 ? "sm:col-span-2" : ""
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-display font-semibold text-foreground text-sm sm:text-base">
                  {tier.name}
                </span>
                <span className="font-mono text-xs sm:text-sm font-bold text-accent">
                  {tier.price}
                  <span className="text-muted-foreground font-normal">{t("perMonth")}</span>
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{tier.desc}</p>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3.5 py-2.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
          <span>{t("allTiersInclude")}</span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 pt-2">
        <a
          href={PATREON_LOGIN_HREF}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-[#FF424D] hover:bg-[#FF424D]/90 text-white font-medium px-7 min-h-[44px] text-sm sm:text-base transition-colors cursor-pointer shadow-lg shadow-[#FF424D]/25 focus-visible:ring-2 focus-visible:ring-[#FF424D] focus-visible:outline-none"
        >
          {t("loginWithPatreon")}
        </a>
        <a
          href={campaignUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full border border-border/80 bg-background/80 hover:bg-background text-foreground font-medium px-6 min-h-[44px] text-sm sm:text-base transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
        >
          <span>{t("pledgeOnPatreon")}</span>
          <ExternalLink className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}
