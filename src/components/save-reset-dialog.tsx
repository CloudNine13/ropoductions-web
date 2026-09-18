"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, RotateCcw, X, Loader2, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { resetSaves } from "@/lib/save-bridge";
import { SAVE_DIALOG_DISMISS_MS } from "@/types/save";

export interface SaveResetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetWindow?: Window | null;
  getTargetWindow?: () => Window | null;
  targetOrigin?: string;
  container?: HTMLElement | null;
  onSuccess?: () => void;
}

export function SaveResetDialog({
  open,
  onOpenChange,
  targetWindow,
  getTargetWindow,
  targetOrigin,
  container,
  onSuccess,
}: SaveResetDialogProps) {
  const [status, setStatus] = useState<"idle" | "resetting" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const t = useTranslations("game");
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (dismissTimeoutRef.current) {
        clearTimeout(dismissTimeoutRef.current);
      }
    };
  }, []);

  const resetState = useCallback(() => {
    if (dismissTimeoutRef.current) {
      clearTimeout(dismissTimeoutRef.current);
      dismissTimeoutRef.current = null;
    }
    setStatus("idle");
    setErrorMessage(null);
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && status === "resetting") {
        return;
      }
      if (!nextOpen) {
        resetState();
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange, resetState, status]
  );

  const inFlightRef = useRef(false);
  const handleReset = useCallback(async () => {
    if (inFlightRef.current) {
      return;
    }
    const engineWindow = getTargetWindow?.() ?? targetWindow ?? null;
    if (!engineWindow) {
      setStatus("error");
      setErrorMessage(t("engineLoadError"));
      return;
    }

    inFlightRef.current = true;
    setStatus("resetting");
    setErrorMessage(null);

    try {
      await resetSaves(engineWindow, targetOrigin);
      setStatus("success");
      onSuccess?.();

      dismissTimeoutRef.current = setTimeout(() => {
        handleOpenChange(false);
      }, SAVE_DIALOG_DISMISS_MS);
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : t("engineLoadError"));
    } finally {
      inFlightRef.current = false;
    }
  }, [targetWindow, getTargetWindow, targetOrigin, onSuccess, handleOpenChange, t]);

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal container={container}>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl transition-opacity motion-reduce:transition-none" />
        <Dialog.Content
          data-testid="save-reset-dialog"
          className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border/80 bg-card p-6 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.8)] outline-none sm:p-8"
        >
          <div className="flex items-center justify-between pb-4 border-b border-border/60">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E11D48]/15 text-[#E11D48] border border-[#E11D48]/30">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <Dialog.Title className="font-display text-lg font-bold tracking-wide text-foreground sm:text-xl">
                  {t("saveResetTitle")}
                </Dialog.Title>
              </div>
            </div>
            <Dialog.Close
              data-testid="save-reset-close-button"
              disabled={status === "resetting"}
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border/80 bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label={t("saveResetClose")}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Dialog.Close>
          </div>

          <div className="mt-5 flex flex-col gap-4">
            <Dialog.Description asChild>
              <div className="space-y-2.5 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                <p className="font-semibold text-[#E11D48] flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-[#E11D48]" aria-hidden="true" />
                  <span>{t("saveResetWarning")}</span>
                </p>
                <p>{t("saveResetDesc")}</p>
              </div>
            </Dialog.Description>

            {status === "error" && errorMessage && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-lg border border-[#E11D48]/40 bg-[#E11D48]/10 p-3 text-xs sm:text-sm text-[#E11D48]"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{errorMessage}</span>
              </div>
            )}

            {status === "success" && (
              <div
                role="status"
                className="flex items-center gap-2.5 rounded-lg border border-[#22C55E]/40 bg-[#22C55E]/10 p-3 text-xs sm:text-sm text-[#22C55E]"
              >
                <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{t("saveResetSuccess")}</span>
              </div>
            )}

            <div className="mt-4 flex flex-col-reverse sm:flex-row items-center justify-end gap-3">
              <button
                type="button"
                data-testid="save-reset-cancel-button"
                onClick={() => handleOpenChange(false)}
                disabled={status === "resetting"}
                className="w-full sm:w-auto inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-border/80 bg-background/80 px-4 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t("saveResetCancel")}
              </button>
              <button
                type="button"
                data-testid="save-reset-confirm-button"
                onClick={handleReset}
                disabled={status === "resetting"}
                className="w-full sm:w-auto inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-lg bg-[#E11D48] px-5 text-xs font-semibold text-white hover:bg-[#E11D48]/90 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D48] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {status === "resetting" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span>{t("saveResetting")}</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    <span>{t("saveResetConfirm")}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
