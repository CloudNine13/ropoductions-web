"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertCircle, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { PatreonPaywallCard } from "@/components/patreon-paywall-card";
import { hasAgeVerifiedCookie } from "@/lib/cookies";
import {
  getPaywallBannerMessageKey,
  type PaywallType,
} from "@/lib/paywall";

interface PaywallModalProps {
  type: PaywallType;
}

export function PaywallModal({ type }: PaywallModalProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const t = useTranslations("paywall");

  useEffect(() => {
    if (hasAgeVerifiedCookie()) {
      setOpen(true);
      return;
    }
    const onAgeVerified = () => setOpen(true);
    window.addEventListener("ropoductions:age-verified", onAgeVerified);
    return () => window.removeEventListener("ropoductions:age-verified", onAgeVerified);
  }, []);

  const close = () => {
    setOpen(false);
    router.replace("/");
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl" />
        <Dialog.Content
          id="paywall-section"
          className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border/80 bg-background p-4 shadow-2xl shadow-black/80 outline-none sm:p-6"
        >
          <Dialog.Title className="sr-only">{t("title")}</Dialog.Title>
          <aside
            aria-label="Access notification"
            className="mb-4 flex items-center gap-3 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3"
          >
            <AlertCircle className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
            <p className="text-xs font-medium leading-normal text-foreground sm:text-sm">
              {t(getPaywallBannerMessageKey(type))}
            </p>
          </aside>
          <PatreonPaywallCard />
          <button
            type="button"
            onClick={close}
            aria-label={t("dismiss")}
            className="absolute right-3 top-3 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent/20 hover:text-foreground cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
