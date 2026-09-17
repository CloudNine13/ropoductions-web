"use client";

import { useState } from "react";
import { AlertCircle, X, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  getPaywallBannerMessageKey,
  PAYWALL_CAMPAIGN_URL,
  type PaywallType,
} from "@/lib/paywall";

interface PaywallNotificationBannerProps {
  type: PaywallType;
  campaignUrl?: string;
}

export function PaywallNotificationBanner({
  type,
  campaignUrl = PAYWALL_CAMPAIGN_URL,
}: PaywallNotificationBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const t = useTranslations("paywall");

  if (dismissed) {
    return null;
  }

  const message = t(getPaywallBannerMessageKey(type));

  return (
    <aside
      aria-label="Access notification"
      className="w-full border-b border-accent/40 bg-accent/10 px-4 py-3 text-foreground animate-in fade-in duration-200"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <AlertCircle className="h-5 w-5 text-accent shrink-0" aria-hidden="true" />
          <p className="text-xs sm:text-sm font-medium leading-normal text-foreground">
            {message}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={campaignUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/15 px-3 py-1 text-xs font-medium text-accent hover:bg-accent/25 transition-colors cursor-pointer min-h-[44px]"
          >
            <span>{t("pledgeOnPatreon")}</span>
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label={t("dismiss")}
            className="inline-flex items-center justify-center rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-accent/20 transition-colors cursor-pointer min-h-[44px] min-w-[44px]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </aside>
  );
}
