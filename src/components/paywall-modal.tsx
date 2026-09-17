"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
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
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            document.getElementById("paywall-section")?.focus({ preventScroll: true });
          }}
          className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border/80 bg-background p-4 shadow-2xl shadow-black/80 outline-none sm:p-6"
        >
          <Dialog.Title className="sr-only">{t("title")}</Dialog.Title>
          <PatreonPaywallCard />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
