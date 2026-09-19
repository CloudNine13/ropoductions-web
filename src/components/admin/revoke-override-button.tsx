"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, Ban, Loader2, ShieldOff, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { revokeOverrideAction } from "@/app/(admin)/admin/overrides/actions";
import type { OverrideRole } from "@/types/database";

export interface RevokeOverrideButtonProps {
  patronId: string;
  role: OverrideRole;
}

export function RevokeOverrideButton({
  patronId,
  role,
}: RevokeOverrideButtonProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const t = useTranslations("admin.revoke");

  const handleConfirm = () => {
    setError(null);
    const formData = new FormData();
    formData.set("patron_id", patronId);
    startTransition(async () => {
      try {
        const result = await revokeOverrideAction(undefined, formData);
        if (result.success) {
          setOpen(false);
          router.refresh();
        } else {
          setError(result.error ?? t("error"));
        }
      } catch {
        setError(t("errorRetry"));
      }
    });
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && pending) {
      return;
    }
    setOpen(nextOpen);
    if (nextOpen) {
      setError(null);
    }
  };

  return (
    <div className="flex items-center justify-end gap-2">
      <Dialog.Root open={open} onOpenChange={handleOpenChange}>
        <Dialog.Trigger asChild>
          <button
            type="button"
            data-testid="override-revoke-trigger"
            aria-label={t("ariaLabel", { role, patronId })}
            className="inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-[#E11D48]/40 bg-[#E11D48]/10 px-3 text-xs font-semibold text-[#E11D48] transition-colors hover:bg-[#E11D48]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D48]"
          >
            <ShieldOff className="h-4 w-4" aria-hidden="true" />
            <span>{t("trigger")}</span>
          </button>
        </Dialog.Trigger>

        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl transition-opacity motion-reduce:transition-none" />
          <Dialog.Content
            data-testid="override-revoke-dialog"
            className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border/80 bg-card p-6 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.8)] outline-none sm:p-8"
          >
            <div className="flex items-center justify-between border-b border-border/60 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#E11D48]/30 bg-[#E11D48]/15 text-[#E11D48]">
                  <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                </div>
                <Dialog.Title className="font-display text-lg font-bold tracking-wide text-foreground sm:text-xl">
                  {t("dialogTitle")}
                </Dialog.Title>
              </div>
              <Dialog.Close
                disabled={pending}
                data-testid="override-revoke-close-button"
                aria-label={t("closeLabel")}
                className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg border border-border/80 bg-background/80 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Dialog.Close>
            </div>

            <div className="mt-5 flex flex-col gap-4">
              <Dialog.Description asChild>
                <div className="space-y-2.5 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                  <p className="flex items-center gap-2 font-semibold text-[#E11D48]">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-[#E11D48]" aria-hidden="true" />
                    <span>{t("cannotUndo")}</span>
                  </p>
                  <p>
                    {t("description", { role, patronId })}
                  </p>
                </div>
              </Dialog.Description>

              {error && (
                <div
                  role="alert"
                  data-testid="override-revoke-error"
                  className="flex items-start gap-2.5 rounded-lg border border-[#E11D48]/40 bg-[#E11D48]/10 p-3 text-xs text-[#E11D48] sm:text-sm"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              <div className="mt-4 flex flex-col-reverse items-center justify-end gap-3 sm:flex-row">
                <button
                  type="button"
                  data-testid="override-revoke-cancel-button"
                  onClick={() => handleOpenChange(false)}
                  disabled={pending}
                  className="inline-flex min-h-[44px] min-w-[44px] w-full cursor-pointer items-center justify-center rounded-lg border border-border/80 bg-background/80 px-4 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  {t("cancel")}
                </button>
                <button
                  type="button"
                  data-testid="override-revoke-confirm-button"
                  onClick={handleConfirm}
                  disabled={pending}
                  className="inline-flex min-h-[44px] min-w-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#E11D48] px-5 text-xs font-semibold text-white transition-colors hover:bg-[#E11D48]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D48] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  {pending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      <span>{t("revoking")}</span>
                    </>
                  ) : (
                    <>
                      <Ban className="h-4 w-4" aria-hidden="true" />
                      <span>{t("confirm")}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}