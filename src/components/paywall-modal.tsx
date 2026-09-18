"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { PatreonPaywallCard } from "@/components/patreon-paywall-card";
import { hasAgeVerifiedCookie } from "@/lib/cookies";
import { restoreLandingScrollPosition } from "@/lib/paywall";

export function PaywallModal() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const t = useTranslations("paywall");

  useEffect(() => {
    const openWindow = () => {
      restoreLandingScrollPosition();
      setOpen(true);
    };
    if (hasAgeVerifiedCookie()) {
      openWindow();
      return;
    }
    window.addEventListener("ropoductions:age-verified", openWindow);
    return () => window.removeEventListener("ropoductions:age-verified", openWindow);
  }, []);

  const close = () => {
    setOpen(false);
    router.replace("/", { scroll: false });
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
          tabIndex={-1}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            document.getElementById("paywall-section")?.focus({ preventScroll: true });
          }}
          className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border/80 bg-card shadow-[0_10px_30px_-10px_rgba(0,0,0,0.8)] outline-none p-0"
        >
          <Dialog.Title className="sr-only">{t("title")}</Dialog.Title>
          <Dialog.Description className="sr-only">{t("subtitle")}</Dialog.Description>
          <Dialog.Close
            className="absolute top-4 right-4 z-10 inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border/80 bg-background/80 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
            aria-label={t("dismiss")}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Dialog.Close>
          <PatreonPaywallCard />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
