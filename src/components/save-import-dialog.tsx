"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Upload, X, AlertCircle, Check, Loader2, FileArchive } from "lucide-react";
import { useTranslations } from "next-intl";
import { importSaves, INVALID_SAVE_FORMAT_ERROR, SAVE_DIALOG_DISMISS_MS, type ImportSavesResult } from "@/lib/save-import";

export interface SaveImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetWindow?: Window | null;
  getTargetWindow?: () => Window | null;
  targetOrigin?: string;
  container?: HTMLElement | null;
  onSuccess?: (result: ImportSavesResult) => void;
}

export function SaveImportDialog({
  open,
  onOpenChange,
  targetWindow,
  getTargetWindow,
  targetOrigin,
  container,
  onSuccess,
}: SaveImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [status, setStatus] = useState<"idle" | "importing" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
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
    setFile(null);
    setIsDragOver(false);
    setStatus("idle");
    setErrorMessage(null);
    setSuccessCount(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && status === "importing") {
        return;
      }
      if (!nextOpen) {
        resetState();
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange, resetState, status]
  );

  const handleFileSelect = useCallback((selectedFile: File) => {
    setErrorMessage(null);
    setStatus("idle");
    setFile(selectedFile);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      e.target.value = "";
      if (selected) {
        handleFileSelect(selected);
      }
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      if (e.dataTransfer.files.length !== 1) {
        setStatus("error");
        setErrorMessage(t("saveImportError"));
        return;
      }
      const droppedFile = e.dataTransfer.files?.[0];
      if (droppedFile) {
        handleFileSelect(droppedFile);
      }
    },
    [handleFileSelect, t]
  );

  const handleDropzoneKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fileInputRef.current?.click();
      }
    },
    []
  );

  const handleImport = useCallback(async () => {
    if (!file) {
      return;
    }

    const engineWindow = getTargetWindow?.() ?? targetWindow ?? null;
    if (!engineWindow) {
      setStatus("error");
      setErrorMessage(t("engineLoadError"));
      return;
    }

    setStatus("importing");
    setErrorMessage(null);

    try {
      const result = await importSaves(engineWindow, file, file.name, {
        targetOrigin,
      });

      setStatus("success");
      setSuccessCount(result.slotCount);
      onSuccess?.(result);

      dismissTimeoutRef.current = setTimeout(() => {
        handleOpenChange(false);
      }, SAVE_DIALOG_DISMISS_MS);
    } catch (err) {
      setStatus("error");
      const message = err instanceof Error ? err.message : INVALID_SAVE_FORMAT_ERROR;
      setErrorMessage(message === INVALID_SAVE_FORMAT_ERROR ? t("saveImportError") : message);
    }
  }, [file, targetWindow, getTargetWindow, targetOrigin, onSuccess, handleOpenChange, t]);

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal container={container}>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl transition-opacity motion-reduce:transition-none" />
        <Dialog.Content
          data-testid="save-import-dialog"
          className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border/80 bg-card p-6 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.8)] outline-none sm:p-8"
        >
          <div className="flex items-center justify-between pb-4 border-b border-border/60">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                <FileArchive className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <Dialog.Title className="font-display text-lg font-bold tracking-wide text-foreground sm:text-xl">
                  {t("saveImportTitle")}
                </Dialog.Title>
                <Dialog.Description className="text-xs text-muted-foreground sm:text-sm mt-0.5">
                  {t("saveImportDesc")}
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close
              data-testid="save-import-close-button"
              disabled={status === "importing"}
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border/80 bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label={t("saveImportClose")}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Dialog.Close>
          </div>

          <div className="mt-6 flex flex-col gap-4">
            {/* Drag and Drop Zone */}
            <div
              data-testid="save-import-dropzone"
              role="button"
              tabIndex={0}
              aria-label={file ? file.name : t("saveImportDropzone")}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={handleDropzoneKeyDown}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`relative flex flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
                isDragOver
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border/80 bg-background/40 hover:bg-background/60 hover:border-white/20 text-muted-foreground"
              }`}
            >
              <input
                ref={fileInputRef}
                data-testid="save-import-file-input"
                type="file"
                accept=".zip,.rpgsave,application/zip,application/x-zip-compressed"
                onChange={handleInputChange}
                className="sr-only"
                aria-label={t("saveImportBrowse")}
              />
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5 border border-white/10 text-white/80">
                <Upload className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  {file ? t("saveImportSelectedFile", { name: file.name }) : t("saveImportDropzone")}
                </p>
                <p className="text-xs text-muted-foreground/80">
                  {t("saveImportFormatHint")}
                </p>
              </div>
              <span
                aria-hidden="true"
                className="mt-2 inline-flex min-h-[44px] items-center justify-center rounded-lg border border-border bg-card px-4 text-xs font-semibold text-foreground transition-colors hover:bg-muted hover:text-white"
              >
                {t("saveImportBrowse")}
              </span>
            </div>

            {/* Error Banner */}
            {status === "error" && errorMessage && (
              <div
                data-testid="save-import-error-banner"
                role="alert"
                className="flex items-start gap-3 rounded-lg border border-[#E11D48]/40 bg-[#E11D48]/10 p-3.5 text-xs sm:text-sm text-[#E11D48]"
              >
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden="true" />
                <span className="leading-snug">{errorMessage}</span>
              </div>
            )}

            {/* Success Banner */}
            {status === "success" && (
              <div
                data-testid="save-import-success-banner"
                role="status"
                className="flex items-center gap-3 rounded-lg border border-[#22C55E]/40 bg-[#22C55E]/10 p-3.5 text-xs sm:text-sm text-[#22C55E]"
              >
                <Check className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span className="leading-snug">
                  {t("saveImportSuccess", { count: successCount })}
                </span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="mt-4 flex flex-col-reverse sm:flex-row items-center justify-end gap-3">
              <button
                type="button"
                data-testid="save-import-cancel-button"
                onClick={() => handleOpenChange(false)}
                disabled={status === "importing"}
                className="w-full sm:w-auto inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-border/80 bg-background/80 px-4 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t("saveImportCancel")}
              </button>
              <button
                type="button"
                data-testid="save-import-confirm-button"
                onClick={handleImport}
                disabled={!file || status === "importing"}
                className="w-full sm:w-auto inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-lg bg-primary px-5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {status === "importing" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span>{t("saveImporting")}</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" aria-hidden="true" />
                    <span>{t("saveImportConfirm")}</span>
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
