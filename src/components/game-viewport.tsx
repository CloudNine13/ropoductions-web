"use client";

import React, { useState, useRef, useEffect, useCallback, useId } from "react";
import Image from "next/image";
import { ChevronUp, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { EngineBootRecovery } from "./engine-boot-recovery";
import { SaveHudDock } from "./save-hud-dock";
import { SaveImportDialog } from "./save-import-dialog";
import { SaveResetDialog } from "./save-reset-dialog";
import { exportSaves } from "../lib/save-export";
import {
  buildDiagnosticsReport,
  classifyEngineBootFailure,
  isEngineReadyReport,
  parseEngineBootFailureReport,
  runWebglProbe,
  webglProbeDiagnostics,
  type WebglProbeResult,
} from "../lib/engine-boot-failure";
import { HUD_ACTIVITY_MESSAGE_TYPE } from "../types/save";
import {
  ENGINE_BOOT_FAILURE_MESSAGE_TYPE,
  type EngineBootDiagnostics,
  type EngineBootFailureClass,
  type EngineBootFailureReport,
} from "../types/engine-boot";
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

/** Budget for the engine document itself to load before the host inspects it. */
const BOOT_LOAD_TIMEOUT_MS = 20000;
/** Budget for a loaded engine document to report readiness or a failure. */
const BOOT_READY_TIMEOUT_MS = 6000;

/** MZ's boot script, as it appears in the shell document's `script[src]` list. */
const BOOT_SCRIPT_PATTERN = /(^|\/)main\.js(\?|#|$)/;

interface EngineBootFailureInput {
  failureClass: EngineBootFailureClass;
  raw?: string;
  diagnostics?: EngineBootDiagnostics;
}

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
  const [loadProgress, setLoadProgress] = useState(0);
  const [frameSrc, setFrameSrc] = useState<string | null>(null);
  const [bootFailure, setBootFailure] = useState<EngineBootFailureReport | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [portalElement, setPortalElement] = useState<HTMLDivElement | null>(null);
  const hudId = useId();
  const t = useTranslations("game");

  const probeRef = useRef<WebglProbeResult | null>(null);
  const bootReadyRef = useRef(false);
  const frameLoadedRef = useRef(false);
  const loadInFlightRef = useRef(false);
  const watchdogRef = useRef<number | null>(null);

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current !== null) {
      window.clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const applyFailure = useCallback(
    (failure: EngineBootFailureInput) => {
      // A failure reported after readiness belongs to a running game, not to its
      // boot: the recovery surface never replaces a live session.
      if (bootReadyRef.current) {
        return;
      }
      clearWatchdog();
      loadInFlightRef.current = false;
      setBootFailure({
        type: ENGINE_BOOT_FAILURE_MESSAGE_TYPE,
        failureClass: failure.failureClass,
        ...(failure.raw ? { raw: failure.raw } : {}),
        diagnostics: buildDiagnosticsReport(
          failure.diagnostics,
          probeRef.current ? webglProbeDiagnostics(probeRef.current) : undefined
        ),
      });
    },
    [clearWatchdog]
  );

  const inspectEngineDocument = useCallback(async () => {
    const frame = iframeRef.current;
    let doc: Document | null = null;
    try {
      doc = frame ? frame.contentDocument : null;
    } catch {
      doc = null;
    }

    const scriptSources: string[] = [];
    if (doc) {
      const scripts = doc.querySelectorAll("script[src]");
      for (let index = 0; index < scripts.length; index++) {
        const src = scripts[index].getAttribute("src");
        if (src) {
          scriptSources.push(src);
        }
      }
    }

    const printerText = doc ? (doc.getElementById("errorPrinter")?.textContent ?? "").trim() : "";
    if (printerText) {
      applyFailure({
        failureClass: classifyEngineBootFailure(printerText),
        raw: printerText,
        diagnostics: { engineScripts: scriptSources },
      });
      return;
    }

    const bootScript = scriptSources.find((src) => BOOT_SCRIPT_PATTERN.test(src));
    if (!bootScript) {
      if (!doc) {
        applyFailure({
          failureClass: "boot_request_failed",
          diagnostics: {
            url: engineSrc,
            networkError: "engine document unavailable",
            engineScripts: scriptSources,
          },
        });
      }
      // No boot script in the document means there is nothing to boot (the
      // website-owned mock harness); silence from it is not a failure.
      return;
    }

    try {
      const response = await fetch(bootScript, { cache: "no-store" });
      if (!response.ok) {
        applyFailure({
          failureClass: "asset_load_failed",
          raw: `Failed to load ${bootScript}`,
          diagnostics: {
            url: bootScript,
            status: response.status,
            engineScripts: scriptSources,
          },
        });
      }
      // A reachable boot script means the engine is still booting: the watchdog
      // never concludes a failure from silence alone.
    } catch (error) {
      applyFailure({
        failureClass: "boot_request_failed",
        raw: "Your browser does not allow to read local files.",
        diagnostics: {
          url: bootScript,
          networkError: error instanceof Error ? error.message : String(error),
          engineScripts: scriptSources,
        },
      });
    }
  }, [applyFailure, engineSrc]);

  const armWatchdog = useCallback(
    (delayMs: number) => {
      clearWatchdog();
      watchdogRef.current = window.setTimeout(() => {
        watchdogRef.current = null;
        void inspectEngineDocument();
      }, delayMs);
    },
    [clearWatchdog, inspectEngineDocument]
  );

  const markEngineReady = useCallback(() => {
    bootReadyRef.current = true;
    loadInFlightRef.current = false;
    clearWatchdog();
    setBootFailure(null);
    setLoadProgress(100);
    setIsEngineReady(true);
  }, [clearWatchdog]);

  useEffect(() => {
    const probe = runWebglProbe();
    probeRef.current = probe;
    if (!probe.supported) {
      // Client-only preflight: the probe cannot run during the server render, so
      // the answer lands after mount and the engine document is never requested.
      applyFailure({
        failureClass: "webgl_unavailable",
        raw: "Your browser does not support WebGL.",
      });
      return;
    }
    loadInFlightRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFrameSrc(engineSrc);
    armWatchdog(BOOT_LOAD_TIMEOUT_MS);
  }, [applyFailure, armWatchdog, engineSrc]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const frameWindow = iframeRef.current?.contentWindow;
      if (!frameWindow) {
        return;
      }
      const origin = window.location.origin;
      if (isEngineReadyReport(event, frameWindow, origin)) {
        markEngineReady();
        return;
      }
      const report = parseEngineBootFailureReport(event, frameWindow, origin);
      if (report) {
        applyFailure(report);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [applyFailure, markEngineReady]);

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
    if (isEngineReady || bootFailure) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const id = window.setInterval(() => {
      setLoadProgress((current) => Math.min(current + LOAD_TICK_STEP, LOAD_TICK_CAP));
    }, LOAD_TICK_MS);
    return () => window.clearInterval(id);
  }, [isEngineReady, bootFailure]);

  useEffect(() => clearWatchdog, [clearWatchdog]);

  const handleIframeLoad = useCallback(() => {
    frameLoadedRef.current = true;
    loadInFlightRef.current = false;
    // The document loaded: the engine owns the screen from here. A shell that
    // predates the ready protocol still clears the loading overlay, while the
    // explicit ready report stays the boundary that closes the boot window.
    setLoadProgress(100);
    setIsEngineReady(true);
    try {
      const iframeDoc = iframeRef.current?.contentDocument;
      if (iframeDoc) {
        const forwardActivity = () => {
          window.postMessage({ type: HUD_ACTIVITY_MESSAGE_TYPE }, window.location.origin);
        };
        iframeDoc.addEventListener("pointerdown", forwardActivity, { passive: true });
        iframeDoc.addEventListener("keydown", forwardActivity, { passive: true });
        iframeDoc.addEventListener("wheel", forwardActivity, { passive: true });
      }
    } catch {
      // Fallback: engine script forwards activity directly
    }
    if (!bootReadyRef.current) {
      armWatchdog(BOOT_READY_TIMEOUT_MS);
    }
  }, [armWatchdog]);

  const handleIframeError = useCallback(() => {
    loadInFlightRef.current = false;
    void inspectEngineDocument();
  }, [inspectEngineDocument]);

  const handleRetryLoad = useCallback(() => {
    // One engine load at a time: a retry while a navigation is in flight is a no-op.
    if (loadInFlightRef.current) {
      return;
    }

    const probe = runWebglProbe();
    probeRef.current = probe;
    if (!probe.supported) {
      applyFailure({
        failureClass: "webgl_unavailable",
        raw: "Your browser does not support WebGL.",
      });
      return;
    }

    setBootFailure(null);
    loadInFlightRef.current = true;

    const frame = iframeRef.current;
    if (!frame) {
      // The preflight refused the first mount, so the frame was never created.
      setFrameSrc(engineSrc);
    } else if (frameLoadedRef.current) {
      try {
        frame.contentWindow?.location.reload();
      } catch {
        frame.setAttribute("src", engineSrc);
      }
    } else {
      try {
        frame.contentWindow?.location.replace(engineSrc);
      } catch {
        frame.setAttribute("src", engineSrc);
      }
    }
    armWatchdog(BOOT_LOAD_TIMEOUT_MS);
  }, [applyFailure, armWatchdog, engineSrc]);

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

  const engineFrame = frameSrc ? (
    <iframe
      ref={iframeRef}
      onLoad={handleIframeLoad}
      onError={handleIframeError}
      src={frameSrc}
      title={title}
      data-testid="game-engine-iframe"
      className="w-full h-full border-0 touch-manipulation select-none"
      allow="fullscreen; autoplay; gamepad"
      sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-modals allow-pointer-lock allow-orientation-lock"
    />
  ) : null;

  const loadingOverlay = !isEngineReady && !bootFailure && (
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

  const bootRecovery = bootFailure && (
    <EngineBootRecovery report={bootFailure} onRetry={handleRetryLoad} />
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
          {bootRecovery}
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
          {bootRecovery}
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
