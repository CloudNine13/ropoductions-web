"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Download, Upload, Maximize2, Minimize2, RotateCcw, Check, Loader2, CircleX } from "lucide-react";
import { useTranslations } from "next-intl";

export type SaveHudExportStatus = "idle" | "exporting" | "success" | "error";

export interface SaveHudDockLabels {
  export?: string;
  exportSuccess?: string;
  exporting?: string;
  exportError?: string;
  import?: string;
  fullscreen?: string;
  exitFullscreen?: string;
  reset?: string;
  dockAria?: string;
}

export interface SaveHudDockProps {
  onExport?: () => Promise<void> | void;
  exportStatus?: SaveHudExportStatus;
  onImport?: () => void;
  onReset?: () => void;
  onToggleFullscreen?: () => void;
  isFullscreen?: boolean;
  idleTimeoutMs?: number;
  className?: string;
  labels?: SaveHudDockLabels;
  id?: string;
}

export const DEFAULT_IDLE_TIMEOUT_MS = 4000;
const ACTIVITY_THROTTLE_MS = 250;

export function SaveHudDock({
  onExport,
  exportStatus,
  onImport,
  onReset,
  onToggleFullscreen,
  isFullscreen = false,
  idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
  className = "",
  labels,
  id,
}: SaveHudDockProps) {
  const [isDimmed, setIsDimmed] = useState(false);
  const [internalExportStatus, setInternalExportStatus] = useState<SaveHudExportStatus>("idle");
  const [exportError, setExportError] = useState<string | null>(null);
  const timerRef = useRef<number | NodeJS.Timeout | null>(null);
  const successTimerRef = useRef<number | NodeJS.Timeout | null>(null);
  const exportingRef = useRef(false);
  const mountedRef = useRef(true);
  const isHoveredOrFocusedRef = useRef(false);
  const lastActivityTimeRef = useRef(0);

  const t = useTranslations("game");

  const resolvedLabels = {
    export: labels?.export ?? t("saveHudExport"),
    exportSuccess: labels?.exportSuccess ?? t("saveHudExportSuccess"),
    exporting: labels?.exporting ?? t("saveHudExporting"),
    exportError: labels?.exportError ?? t("saveExportError"),
    import: labels?.import ?? t("saveHudImport"),
    fullscreen: labels?.fullscreen ?? t("saveHudFullscreen"),
    exitFullscreen: labels?.exitFullscreen ?? t("saveHudExitFullscreen"),
    reset: labels?.reset ?? t("saveHudReset"),
    dockAria: labels?.dockAria ?? t("saveHudDockAria"),
  };

  const isControlledExport = exportStatus !== undefined;
  const currentExportStatus = exportStatus ?? internalExportStatus;
  const isExporting = currentExportStatus === "exporting";
  const isExportSuccess = currentExportStatus === "success";
  const isExportError = currentExportStatus === "error";
  const exportButtonLabel = isExporting
    ? resolvedLabels.exporting
    : isExportSuccess
      ? resolvedLabels.exportSuccess
      : resolvedLabels.export;
  const exportAccessibleName =
    isExportError && exportError ? exportError : exportButtonLabel;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (successTimerRef.current !== null) {
        clearTimeout(successTimerRef.current);
        successTimerRef.current = null;
      }
    };
  }, []);

  const handleExportClick = useCallback(async () => {
    if (!onExport || exportingRef.current) return;
    if (isControlledExport) {
      exportingRef.current = true;
      try {
        await onExport();
      } finally {
        exportingRef.current = false;
      }
      return;
    }
    exportingRef.current = true;
    try {
      if (mountedRef.current) {
        setExportError(null);
        setInternalExportStatus("exporting");
      }
      await onExport();
      if (!mountedRef.current) return;
      setInternalExportStatus("success");
      if (successTimerRef.current !== null) {
        clearTimeout(successTimerRef.current);
      }
      successTimerRef.current = setTimeout(() => {
        if (mountedRef.current) setInternalExportStatus("idle");
      }, 2000);
    } catch (error) {
      if (!mountedRef.current) return;
      const customMessage = error instanceof Error && error.message && error.message !== "Save export failed" ? error.message : resolvedLabels.exportError;
      setExportError(customMessage);
      setInternalExportStatus("error");
    } finally {
      exportingRef.current = false;
    }
  }, [onExport, isControlledExport, resolvedLabels.exportError]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const resetTimer = useCallback(() => {
    clearTimer();
    setIsDimmed(false);

    if (isHoveredOrFocusedRef.current) {
      return;
    }

    timerRef.current = setTimeout(() => {
      if (!isHoveredOrFocusedRef.current) {
        setIsDimmed(true);
      }
    }, idleTimeoutMs);
  }, [clearTimer, idleTimeoutMs]);

  const handleActivity = useCallback(() => {
    const now = Date.now();
    if (now - lastActivityTimeRef.current < ACTIVITY_THROTTLE_MS) {
      return;
    }
    lastActivityTimeRef.current = now;
    resetTimer();
  }, [resetTimer]);

  useEffect(() => {
    resetTimer();

    const onUserActivity = () => {
      handleActivity();
    };

    const onMessage = (event: MessageEvent) => {
      if (
        event.origin === window.location.origin &&
        event.data?.type === "ROPODUCTIONS_ACTIVITY"
      ) {
        handleActivity();
      }
    };

    window.addEventListener("pointerdown", onUserActivity, { passive: true });
    window.addEventListener("keydown", onUserActivity, { passive: true });
    window.addEventListener("wheel", onUserActivity, { passive: true });
    window.addEventListener("message", onMessage);

    return () => {
      clearTimer();
      window.removeEventListener("pointerdown", onUserActivity);
      window.removeEventListener("keydown", onUserActivity);
      window.removeEventListener("wheel", onUserActivity);
      window.removeEventListener("message", onMessage);
    };
  }, [handleActivity, resetTimer, clearTimer]);

  const handlePointerEnter = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") {
      return;
    }
    isHoveredOrFocusedRef.current = true;
    clearTimer();
    setIsDimmed(false);
  }, [clearTimer]);

  const handlePointerLeave = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") {
      return;
    }
    isHoveredOrFocusedRef.current = false;
    resetTimer();
  }, [resetTimer]);

  const handleFocus = useCallback(() => {
    isHoveredOrFocusedRef.current = true;
    clearTimer();
    setIsDimmed(false);
  }, [clearTimer]);

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
        isHoveredOrFocusedRef.current = false;
        resetTimer();
      }
    },
    [resetTimer]
  );

  const handleTouchStart = useCallback(() => {
    handleActivity();
  }, [handleActivity]);

  const isExportDisabled = !onExport || isExporting;
  const isImportDisabled = !onImport;
  const isResetDisabled = !onReset;

  return (
    <div
      role="toolbar"
      aria-orientation="horizontal"
      aria-label={resolvedLabels.dockAria}
      data-testid="save-hud-dock"
      data-dimmed={isDimmed ? "true" : "false"}
      id={id}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onTouchStart={handleTouchStart}
      className={`pointer-events-auto flex items-center justify-center gap-1 sm:gap-2 px-3 py-1.5 rounded-full border shadow-2xl transition-[background-color,border-color] duration-300 ease-out motion-reduce:transition-none select-none max-w-[calc(100dvw-2rem)] overflow-x-auto ${
        isDimmed ? "bg-[#090A0F]/40 border-white/5" : "bg-[#090A0F]/75 backdrop-blur-md border-white/10"
      } ${className}`}
    >
      <button
        type="button"
        data-testid="save-hud-export-button"
        data-export-status={currentExportStatus}
        onClick={handleExportClick}
        disabled={isExportDisabled}
        aria-disabled={isExportDisabled}
        aria-busy={isExporting}
        aria-label={exportAccessibleName}
        title={isExportError && exportError ? exportError : exportButtonLabel}
        className={`min-h-[44px] min-w-[44px] px-3 py-2 flex items-center justify-center gap-1.5 rounded-full text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary select-none ${
          isExportDisabled
            ? "text-white/40 cursor-not-allowed opacity-50"
            : isExportSuccess
            ? "text-[#22C55E] bg-[#22C55E]/15 hover:bg-[#22C55E]/20 cursor-pointer"
            : isExportError
            ? "text-[#E11D48] bg-[#E11D48]/15 hover:bg-[#E11D48]/20 cursor-pointer"
            : "text-white/90 hover:text-white hover:bg-white/10 active:bg-white/15 cursor-pointer"
        }`}
      >
        {isExportSuccess ? (
          <Check className="h-4 w-4 shrink-0 text-[#22C55E]" aria-hidden="true" data-testid="save-hud-export-success-icon" />
        ) : isExporting ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" data-testid="save-hud-export-loading-icon" />
        ) : isExportError ? (
          <CircleX className="h-4 w-4 shrink-0 text-[#E11D48]" aria-hidden="true" data-testid="save-hud-export-error-icon" />
        ) : (
          <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
        )}
        <span className="whitespace-nowrap" aria-live="polite">{exportButtonLabel}</span>
      </button>

      <button
        type="button"
        data-testid="save-hud-import-button"
        onClick={onImport}
        disabled={isImportDisabled}
        aria-disabled={isImportDisabled}
        aria-label={resolvedLabels.import}
        title={resolvedLabels.import}
        className={`min-h-[44px] min-w-[44px] px-3 py-2 flex items-center justify-center gap-1.5 rounded-full text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary select-none ${
          isImportDisabled
            ? "text-white/40 cursor-not-allowed opacity-50"
            : "text-white/90 hover:text-white hover:bg-white/10 active:bg-white/15 cursor-pointer"
        }`}
      >
        <Upload className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="hidden sm:inline whitespace-nowrap">{resolvedLabels.import}</span>
      </button>

      <button
        type="button"
        data-testid="save-hud-fullscreen-button fullscreen-toggle-button"
        onClick={onToggleFullscreen}
        aria-pressed={isFullscreen}
        aria-label={isFullscreen ? resolvedLabels.exitFullscreen : resolvedLabels.fullscreen}
        title={isFullscreen ? resolvedLabels.exitFullscreen : resolvedLabels.fullscreen}
        className="min-h-[44px] min-w-[44px] px-3 py-2 flex items-center justify-center gap-1.5 rounded-full text-xs font-medium text-white/90 hover:text-white hover:bg-white/10 active:bg-white/15 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer select-none"
      >
        {isFullscreen ? (
          <Minimize2 className="h-4 w-4 shrink-0" aria-hidden="true" />
        ) : (
          <Maximize2 className="h-4 w-4 shrink-0" aria-hidden="true" />
        )}
        <span className="hidden sm:inline whitespace-nowrap">
          {isFullscreen ? resolvedLabels.exitFullscreen : resolvedLabels.fullscreen}
        </span>
      </button>

      <button
        type="button"
        data-testid="save-hud-reset-button"
        onClick={onReset}
        disabled={isResetDisabled}
        aria-disabled={isResetDisabled}
        aria-label={resolvedLabels.reset}
        title={resolvedLabels.reset}
        className={`group min-h-[44px] min-w-[44px] px-3 py-2 flex items-center justify-center gap-1.5 rounded-full text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D48] select-none ${
          isResetDisabled
            ? "text-white/40 cursor-not-allowed opacity-50"
            : "text-white/80 hover:text-[#E11D48] hover:bg-[#E11D48]/15 active:bg-[#E11D48]/25 cursor-pointer"
        }`}
      >
        <RotateCcw
          className={`h-4 w-4 shrink-0 ${
            isResetDisabled ? "text-white/30" : "text-[#E11D48]/80 group-hover:text-[#E11D48]"
          }`}
          aria-hidden="true"
        />
        <span className={`hidden sm:inline whitespace-nowrap ${!isResetDisabled ? "group-hover:text-[#E11D48]" : ""}`}>
          {resolvedLabels.reset}
        </span>
      </button>
    </div>
  );
}
