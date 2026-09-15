"use client";

import { useState, useEffect, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ShieldAlert } from "lucide-react";
import { hasAgeVerifiedCookie, setAgeVerifiedCookie } from "@/lib/cookies";

interface AgeGateDialogProps {
  isServerVerified?: boolean;
  redirectUrl?: string;
}

export function AgeGateDialog({
  isServerVerified = false,
  redirectUrl = "https://google.com",
}: AgeGateDialogProps) {
  const [isOpen, setIsOpen] = useState(!isServerVerified);

  useEffect(() => {
    // Client-side cookie check synchronizes local storage state
    if (hasAgeVerifiedCookie()) {
      setIsOpen(false);
    } else {
      setIsOpen(true);
    }
  }, []);

  const handleOpenChange = useCallback((open: boolean) => {
    // Mandatory gate: disallow unverified dismissal through external triggers
    if (!open && !hasAgeVerifiedCookie()) {
      return;
    }
    setIsOpen(open);
  }, []);

  const handleConfirm = useCallback(() => {
    setAgeVerifiedCookie();
    setIsOpen(false);
  }, []);

  const handleExit = useCallback(() => {
    // Replace navigation history to avoid back-button loop into gated content
    window.location.replace(redirectUrl);
  }, [redirectUrl]);

  return (
    <Dialog.Root open={isOpen} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="age-gate-overlay fixed inset-0 z-50 bg-black/80 backdrop-blur-xl" />
        <Dialog.Content
          className="age-gate-content z-50 w-[calc(100%-2rem)] max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-xl border border-border border-t-2 border-t-primary bg-card p-6 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.8)] focus:outline-none sm:p-8"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <div className="flex flex-col items-center text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/30">
              <ShieldAlert className="h-6 w-6" aria-hidden="true" />
            </div>

            <Dialog.Title className="font-display text-2xl font-bold tracking-wide text-foreground sm:text-3xl">
              21+ Age Verification Required
            </Dialog.Title>

            <Dialog.Description className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
              This website hosts adult indie game content, explicit visual
              novels, and mature themes intended strictly for individuals aged
              21 or older. By entering, you confirm that you meet the legal age
              requirement in your jurisdiction.
            </Dialog.Description>

            <div className="mt-6 flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
              <button
                type="button"
                autoFocus
                onClick={handleConfirm}
                className="inline-flex min-h-[44px] min-w-[44px] flex-1 items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
              >
                I am 21 or older — Enter Studio
              </button>
              <button
                type="button"
                onClick={handleExit}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-transparent px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
              >
                Exit
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
