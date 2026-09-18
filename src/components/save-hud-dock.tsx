"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Download, Upload, Maximize2, Minimize2, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";

export interface SaveHudDockLabels {
  export?: string;
  import?: string;
  fullscreen?: string;
  exitFullscreen?: string;
  reset?: string;
  dockAria?: string;
}

export interface SaveHudDockProps {
  onExport?: () => void;
  onImport?: () => void;
  onReset?: () => void;
  onToggleFullscreen?: () => void;
  isFullscreen?: boolean;
  idleTimeoutMs?: number;
  className?: string;
  labels?: SaveHudDockLabels;
}

export const DEFAULT_IDLE_TIMEOUT_MS = 4000;

export function SaveHudDock({
  onExport,
  onImport,
  onReset,
  onToggleFullscreen,
  isFullscreen = false,
  idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
  className = "",
  labels,
}: SaveHudDockProps) {
  const [isDimmed, setIsDimmed] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | number | null>(null);
  const isHoveredOrFocusedRef = useRef(false);

  const t = useTranslations("game");

  const resolvedLabels = {
    export: labels?.export ?? t("saveHudExport"),
    import: labels?.import ?? t("saveHudImport"),
    fullscreen: labels?.fullscreen ?? t("saveHudFullscreen"),
    exitFullscreen: labels?.exitFullscreen ?? t("fullscreenExit"),
    reset: labels?.reset ?? t("saveHudReset"),
    dockAria: labels?.dockAria ?? t("saveHudDockAria"),
  };

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

  useEffect(() => {
    resetTimer();

    const handleUserActivity = () => {
      resetTimer();
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "pointerdown",
      "wheel",
      "scroll",
    ];

    for (const eventName of activityEvents) {
      window.addEventListener(eventName, handleUserActivity, { passive: true });
    }

    return () => {
      clearTimer();
      for (const eventName of activityEvents) {
        window.removeEventListener(eventName, handleUserActivity);
      }
    };
  }, [resetTimer, clearTimer]);

  const handleMouseEnter = useCallback(() => {
    isHoveredOrFocusedRef.current = true;
    clearTimer();
    setIsDimmed(false);
  }, [clearTimer]);

  const handleMouseLeave = useCallback(() => {
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

  return (
    <div
      role="toolbar"
      aria-label={resolvedLabels.dockAria}
      data-testid="save-hud-dock"
      data-dimmed={isDimmed ? "true" : "false"}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onTouchStart={handleMouseEnter}
      onTouchEnd={handleMouseLeave}
      onTouchCancel={handleMouseLeave}
      style={{ opacity: isDimmed ? 0.25 : 1 }}
      className={`pointer-events-auto flex items-center justify-center gap-1 sm:gap-2 px-3 py-1.5 rounded-full bg-black/75 backdrop-blur-md border border-white/10 shadow-2xl transition-opacity duration-300 ease-out select-none ${
        isDimmed ? "opacity-25" : "opacity-100"
      } ${className}`}
    >
      <button
        type="button"
        data-testid="save-hud-export-button"
        onClick={onExport}
        aria-label={resolvedLabels.export}
        title={resolvedLabels.export}
        className="min-h-[44px] min-w-[44px] px-3 py-2 flex items-center justify-center gap-1.5 rounded-full text-xs font-medium text-white/90 hover:text-white hover:bg-white/10 active:bg-white/15 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer select-none"
      >
        <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="hidden sm:inline">{resolvedLabels.export}</span>
      </button>

      <button
        type="button"
        data-testid="save-hud-import-button"
        onClick={onImport}
        aria-label={resolvedLabels.import}
        title={resolvedLabels.import}
        className="min-h-[44px] min-w-[44px] px-3 py-2 flex items-center justify-center gap-1.5 rounded-full text-xs font-medium text-white/90 hover:text-white hover:bg-white/10 active:bg-white/15 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer select-none"
      >
        <Upload className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="hidden sm:inline">{resolvedLabels.import}</span>
      </button>

      <button
        type="button"
        data-testid="save-hud-fullscreen-button"
        onClick={onToggleFullscreen}
        aria-label={isFullscreen ? resolvedLabels.exitFullscreen : resolvedLabels.fullscreen}
        title={isFullscreen ? resolvedLabels.exitFullscreen : resolvedLabels.fullscreen}
        className="min-h-[44px] min-w-[44px] px-3 py-2 flex items-center justify-center gap-1.5 rounded-full text-xs font-medium text-white/90 hover:text-white hover:bg-white/10 active:bg-white/15 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer select-none"
      >
        {isFullscreen ? (
          <Minimize2 className="h-4 w-4 shrink-0" aria-hidden="true" />
        ) : (
          <Maximize2 className="h-4 w-4 shrink-0" aria-hidden="true" />
        )}
        <span className="hidden sm:inline">
          {isFullscreen ? resolvedLabels.exitFullscreen : resolvedLabels.fullscreen}
        </span>
      </button>

      <button
        type="button"
        data-testid="save-hud-reset-button"
        onClick={onReset}
        aria-label={resolvedLabels.reset}
        title={resolvedLabels.reset}
        className="group min-h-[44px] min-w-[44px] px-3 py-2 flex items-center justify-center gap-1.5 rounded-full text-xs font-medium text-white/80 hover:text-rose-200 hover:bg-rose-500/20 active:bg-rose-500/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 cursor-pointer select-none"
      >
        <RotateCcw className="h-4 w-4 shrink-0 text-rose-400/90 group-hover:text-rose-400" aria-hidden="true" />
        <span className="hidden sm:inline group-hover:text-rose-200">{resolvedLabels.reset}</span>
      </button>
    </div>
  );
}
