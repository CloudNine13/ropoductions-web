"use client";

import React, { useState, useRef, useEffect, useCallback, useId } from "react";
import Image from "next/image";
import { ChevronUp, ChevronDown, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { SaveHudDock } from "./save-hud-dock";
import { SaveImportDialog } from "./save-import-dialog";
import { SaveResetDialog } from "./save-reset-dialog";
import { exportSaves } from "../lib/save-export";
export interface GameViewportProps {
  engineSrc?: string;
  title?: string;
  className?: string;
  onExport?: () => Promise<void> | void;
  onImport?: () => void;
  onReset?: () => void;
}

const LOAD_TICK_MS = 150;
const LOAD_TICK_STEP = 7;
const LOAD_TICK_CAP = 90;

export function GameViewport({
  engineSrc = "/engine/index.html",
  title = "Final Orginity",
  className = "",
  onExport,
  onImport,
  onReset,
}: GameViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false);
  const [isHudCollapsed, setIsHudCollapsed] = useState(false);
  const [isEngineReady, setIsEngineReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [engineKey, setEngineKey] = useState(0);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [portalElement, setPortalElement] = useState<HTMLDivElement | null>(null);
  const hudId = useId();
  const t = useTranslations("game");

  useEffect(() => {
    const handleFullscreenChange = () => {
      const doc = document as unknown as {
        fullscreenElement?: Element | null;
        webkitFullscreenElement?: Element | null;
        mozFullScreenElement?: Element | null;
        msFullscreenElement?: Element | null;
      };

      const currentFsElem =
        doc.fullscreenElement ||
        doc.webkitFullscreenElement ||
        doc.mozFullScreenElement ||
        doc.msFullscreenElement;

      // Verify the fullscreen element belongs to our container
      const isOurFs = Boolean(currentFsElem && currentFsElem === containerRef.current);

      setIsFullscreen(isOurFs);
      if (!isOurFs) {
        setIsPseudoFullscreen(false);
        setIsHudCollapsed(false);
      }
    };

    const handleFullscreenError = () => {
      // If native fullscreen fails or is denied, fall back to pseudo-fullscreen
      setIsPseudoFullscreen(true);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("fullscreenerror", handleFullscreenError);
    document.addEventListener("webkitfullscreenerror", handleFullscreenError);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("fullscreenerror", handleFullscreenError);
      document.removeEventListener("webkitfullscreenerror", handleFullscreenError);
    };
  }, []);

  useEffect(() => {
    if (!isPseudoFullscreen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"][data-state="open"]')) {
        return;
      }
      if (e.key === "Escape") {
        setIsPseudoFullscreen(false);
        setIsHudCollapsed(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPseudoFullscreen]);

  useEffect(() => {
    if (isEngineReady || loadError) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const id = window.setInterval(() => {
      setLoadProgress((current) => Math.min(current + LOAD_TICK_STEP, LOAD_TICK_CAP));
    }, LOAD_TICK_MS);
    return () => window.clearInterval(id);
  }, [isEngineReady, loadError]);

  const handleIframeLoad = useCallback(() => {
    setLoadProgress(100);
    setIsEngineReady(true);
    try {
      const iframeDoc = iframeRef.current?.contentDocument;
      if (iframeDoc) {
        const forwardActivity = () => {
          window.postMessage({ type: "ROPODUCTIONS_ACTIVITY" }, window.location.origin);
        };
        iframeDoc.addEventListener("pointerdown", forwardActivity, { passive: true });
        iframeDoc.addEventListener("keydown", forwardActivity, { passive: true });
        iframeDoc.addEventListener("wheel", forwardActivity, { passive: true });
      }
    } catch {
      // Fallback: engine script forwards activity directly
    }
  }, []);

  const handleIframeError = useCallback(() => {
    setLoadError(true);
  }, []);

  const handleRetryLoad = useCallback(() => {
    setLoadError(false);
    setIsEngineReady(false);
    setLoadProgress(0);
    setEngineKey((current) => current + 1);
  }, []);
  const handleExport = useCallback(async () => {
    if (onExport) {
      await onExport();
      return;
    }
    const targetWindow = iframeRef.current?.contentWindow;
    if (!targetWindow) {
      throw new Error("Game engine iframe is not ready");
    }
    await exportSaves(targetWindow);
  }, [onExport]);
  const handleImportClick = useCallback(() => {
    if (onImport) {
      onImport();
    } else {
      setIsImportOpen(true);
    }
  }, [onImport]);

  const handleResetClick = useCallback(() => {
    if (onReset) {
      onReset();
    } else {
      setIsResetOpen(true);
    }
  }, [onReset]);

  const getEngineWindow = useCallback(() => iframeRef.current?.contentWindow ?? null, []);

  useEffect(() => {
    setPortalElement(containerRef.current);
  }, [isFullscreen, isPseudoFullscreen]);

  const toggleFullscreen = useCallback(async () => {
    const doc = document as unknown as {
      fullscreenElement?: Element | null;
      webkitFullscreenElement?: Element | null;
      exitFullscreen?: () => Promise<void>;
      webkitExitFullscreen?: () => void;
    };
    const elem = containerRef.current as unknown as {
      requestFullscreen?: () => Promise<void>;
      webkitRequestFullscreen?: () => void;
    } | null;

    if (!elem) return;

    const isNativeFs = Boolean(
      (doc.fullscreenElement && doc.fullscreenElement === elem) ||
      (doc.webkitFullscreenElement && doc.webkitFullscreenElement === elem)
    );

    if (isPseudoFullscreen) {
      setIsPseudoFullscreen(false);
      setIsHudCollapsed(false);
      return;
    }

    if (!isNativeFs) {
      if (typeof elem.requestFullscreen === "function") {
        try {
          await elem.requestFullscreen();
        } catch {
          setIsPseudoFullscreen(true);
        }
      } else if (typeof elem.webkitRequestFullscreen === "function") {
        try {
          elem.webkitRequestFullscreen();
        } catch {
          setIsPseudoFullscreen(true);
        }
      } else {
        // Fallback for devices without Element.requestFullscreen (e.g. iOS Safari on iPhone)
        setIsPseudoFullscreen(true);
      }
    } else {
      if (typeof doc.exitFullscreen === "function") {
        try {
          await doc.exitFullscreen();
        } catch {
          // Ignore exit rejections
        }
      } else if (typeof doc.webkitExitFullscreen === "function") {
        try {
          doc.webkitExitFullscreen();
        } catch {
          // Ignore exit rejections
        }
      }
      setIsFullscreen(false);
      setIsPseudoFullscreen(false);
      setIsHudCollapsed(false);
    }
  }, [isPseudoFullscreen]);

  const activeFullscreen = isFullscreen || isPseudoFullscreen;

  const engineFrame = (
    <iframe
      key={engineKey}
      ref={iframeRef}
      onLoad={handleIframeLoad}
      onError={handleIframeError}
      src={engineSrc}
      title={title}
      data-testid="game-engine-iframe"
      className="w-full h-full border-0 touch-manipulation select-none"
      allow="fullscreen; autoplay; gamepad"
      sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-modals allow-pointer-lock allow-orientation-lock"
    />
  );

  const loadingOverlay = !isEngineReady && !loadError && (
    <div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 bg-black"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(loadProgress)}
      aria-label={t("engineLoading")}
    >
      <Image
        src="/branding/studio-logo.webp"
        alt=""
        aria-hidden="true"
        width={64}
        height={64}
        unoptimized
        className="pixelated hud-load-pulse motion-reduce:animate-none"
      />
      <div className="h-1 w-48 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full w-full origin-left bg-primary transition-transform duration-150 ease-linear motion-reduce:transition-none"
          style={{ transform: `scaleX(${loadProgress / 100})` }}
        />
      </div>
      <p className="text-sm text-muted-foreground">{t("engineLoading")}</p>
    </div>
  );

  const loadErrorFallback = loadError && (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black px-6 text-center">
      <p className="text-sm text-muted-foreground">{t("engineLoadError")}</p>
      <button
        type="button"
        onClick={handleRetryLoad}
        className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        {t("engineRetry")}
      </button>
    </div>
  );

  if (activeFullscreen) {
    return (
      <div
        ref={containerRef}
        data-testid="game-viewport-container"
        data-fullscreen={activeFullscreen ? "true" : "false"}
        className="fixed inset-0 z-40 w-screen h-dvh max-w-none max-h-none rounded-none border-0 bg-black flex flex-col items-center justify-center select-none touch-manipulation overflow-hidden"
      >
        <div className="relative w-full flex-1 min-h-0 flex items-center justify-center overflow-hidden bg-black">
          {engineFrame}
          {loadingOverlay}
          {loadErrorFallback}
        </div>
        {!isHudCollapsed && (
          <div className="absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-20 pointer-events-none">
            <SaveHudDock
              id={hudId}
              onExport={handleExport}
              onImport={handleImportClick}
              onReset={handleResetClick}
              onToggleFullscreen={toggleFullscreen}
              isFullscreen={activeFullscreen}
            />
          </div>
        )}
        <button
          type="button"
          data-testid="save-hud-collapse-fab"
          onClick={() => setIsHudCollapsed((current) => !current)}
          aria-expanded={!isHudCollapsed}
          aria-controls={hudId}
          aria-label={t("saveHudToggleControls")}
          title={t("saveHudToggleControls")}
          className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 z-20 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-[#090A0F]/75 text-white/90 backdrop-blur-md transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
        >
          {isHudCollapsed ? (
            <ChevronUp className="h-5 w-5" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
        <SaveImportDialog
          open={isImportOpen}
          onOpenChange={setIsImportOpen}
          getTargetWindow={getEngineWindow}
          container={portalElement}
        />
        <SaveResetDialog
          open={isResetOpen}
          onOpenChange={setIsResetOpen}
          getTargetWindow={getEngineWindow}
          container={portalElement}
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-testid="game-viewport-container"
      data-fullscreen={activeFullscreen ? "true" : "false"}
      className={`relative w-auto h-full max-h-full max-w-full flex flex-col items-center justify-center gap-2 select-none touch-manipulation overflow-hidden ${className}`}
    >
      <div className="relative w-auto h-full max-h-full max-w-full aspect-[16/9] rounded-xl border border-border/80 bg-black shadow-2xl flex items-center justify-center select-none touch-manipulation overflow-hidden">
        <div className="relative w-full max-w-full max-h-full aspect-[16/9] flex items-center justify-center overflow-hidden bg-black">
          {engineFrame}
          {loadingOverlay}
          {loadErrorFallback}
        </div>
      </div>
      <div className="flex w-full shrink-0 items-center justify-center">
        <SaveHudDock
          id={hudId}
          onExport={handleExport}
          onImport={handleImportClick}
          onReset={handleResetClick}
          onToggleFullscreen={toggleFullscreen}
          isFullscreen={activeFullscreen}
        />
      </div>
      <SaveImportDialog
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        getTargetWindow={getEngineWindow}
        container={portalElement}
      />
      <SaveResetDialog
        open={isResetOpen}
        onOpenChange={setIsResetOpen}
        getTargetWindow={getEngineWindow}
        container={portalElement}
      />
    </div>
  );
}
