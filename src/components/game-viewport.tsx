"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { useTranslations } from "next-intl";

export interface GameViewportProps {
  engineSrc?: string;
  title?: string;
  className?: string;
}

export function GameViewport({
  engineSrc = "/engine/index.html",
  title = "Final Orginity",
  className = "",
}: GameViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false);

  const t = useTranslations("game");
  const enterLabel = t("fullscreenEnter");
  const exitLabel = t("fullscreenExit");

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
      if (e.key === "Escape") {
        setIsPseudoFullscreen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPseudoFullscreen]);

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
    }
  }, [isPseudoFullscreen]);

  const activeFullscreen = isFullscreen || isPseudoFullscreen;

  return (
    <div
      ref={containerRef}
      data-testid="game-viewport-container"
      data-fullscreen={activeFullscreen ? "true" : "false"}
      className={
        activeFullscreen
          ? "fixed inset-0 z-50 w-screen h-dvh max-w-none max-h-none rounded-none border-0 bg-black flex items-center justify-center select-none touch-manipulation overflow-hidden"
          : `relative w-auto h-full max-h-full max-w-full aspect-[16/9] rounded-xl border border-border/80 bg-black shadow-2xl flex items-center justify-center select-none touch-manipulation overflow-hidden ${className}`
      }
    >
      <div className="relative w-full max-w-full max-h-full aspect-[16/9] flex items-center justify-center overflow-hidden bg-black">
        <iframe
          src={engineSrc}
          title={title}
          data-testid="game-engine-iframe"
          className="w-full h-full border-0 touch-manipulation select-none"
          allow="fullscreen; autoplay; gamepad"
          sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-modals allow-pointer-lock allow-orientation-lock"
        />
      </div>
      <button
        type="button"
        onClick={toggleFullscreen}
        data-testid="fullscreen-toggle-button"
        className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-[max(0.75rem,env(safe-area-inset-right))] z-10 flex items-center justify-center h-11 w-11 rounded-lg bg-black/60 backdrop-blur-md border border-white/20 text-white hover:bg-black/80 transition-colors focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px] min-w-[44px] shadow-lg cursor-pointer"
        aria-label={activeFullscreen ? exitLabel : enterLabel}
        title={activeFullscreen ? exitLabel : enterLabel}
      >
        {activeFullscreen ? (
          <Minimize2 className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Maximize2 className="h-5 w-5" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
