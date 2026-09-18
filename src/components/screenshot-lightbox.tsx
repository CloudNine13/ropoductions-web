"use client";

import { useEffect, useCallback } from "react";
import Image from "next/image";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useTranslations } from "next-intl";

export interface ScreenshotItem {
  id: string;
  src: string;
  alt: string;
  title: string;
  caption: string;
  badge?: string;
}

interface ScreenshotLightboxProps {
  isOpen: boolean;
  onClose: () => void;
  screenshots: ScreenshotItem[];
  currentIndex: number;
  onNavigate: (index: number) => void;
}

export function ScreenshotLightbox({
  isOpen,
  onClose,
  screenshots,
  currentIndex,
  onNavigate,
}: ScreenshotLightboxProps) {
  const t = useTranslations("lightbox");
  const total = screenshots.length;
  const current = screenshots[currentIndex] || screenshots[0];

  const handlePrev = useCallback(() => {
    if (total === 0) return;
    onNavigate((currentIndex - 1 + total) % total);
  }, [currentIndex, total, onNavigate]);

  const handleNext = useCallback(() => {
    if (total === 0) return;
    onNavigate((currentIndex + 1) % total);
  }, [currentIndex, total, onNavigate]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handlePrev, handleNext]);

  if (!current) return null;

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-5xl px-4 sm:px-6 outline-none"
        >
          <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-[0_10px_30px_-10px_rgba(0,0,0,0.8)]">
            {/* Header Toolbar */}
            <div className="flex items-center justify-between border-b border-border bg-card/90 px-4 py-3 sm:px-6">
              <div className="flex items-center gap-3">
                {current.badge && (
                  <span className="rounded bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary border border-primary/30">
                    {current.badge}
                  </span>
                )}
                <Dialog.Title className="font-display text-base sm:text-lg font-bold text-foreground">
                  {current.title}
                </Dialog.Title>
              </div>

              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-muted-foreground">
                  {t("counter", { current: (currentIndex + 1).toString(), total: total.toString() })}
                </span>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex items-center justify-center rounded-md border border-border bg-muted/60 p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px] min-w-[44px] cursor-pointer"
                    aria-label={t("close")}
                  >
                    <X className="h-5 w-5" />
                  </button>
                </Dialog.Close>
              </div>
            </div>

            {/* Main Visual Display */}
            <div className="relative aspect-[16/9] w-full bg-background">
              <Image
                src={current.src}
                alt={current.alt}
                fill
                unoptimized
                className="object-contain"
                sizes="(max-width: 1024px) 100vw, 1024px"
                priority
              />

              {/* Prev / Next Overlay Controls */}
              {total > 1 && (
                <>
                  <button
                    type="button"
                    onClick={handlePrev}
                    className="absolute left-3 top-1/2 -translate-y-1/2 inline-flex items-center justify-center rounded-full border border-border/80 bg-card/80 p-2.5 text-foreground backdrop-blur-md transition-colors motion-reduce:transition-none hover:bg-card hover:border-primary hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px] min-w-[44px] cursor-pointer shadow-lg"
                    aria-label={t("previous")}
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center justify-center rounded-full border border-border/80 bg-card/80 p-2.5 text-foreground backdrop-blur-md transition-colors motion-reduce:transition-none hover:bg-card hover:border-primary hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px] min-w-[44px] cursor-pointer shadow-lg"
                    aria-label={t("next")}
                  >
                    <ChevronRight className="h-6 w-6" />
                  </button>
                </>
              )}
            </div>

            {/* Caption Footer */}
            <div className="border-t border-border bg-card/90 px-4 py-3 sm:px-6">
              <Dialog.Description className="text-sm text-muted-foreground">
                {current.caption}
              </Dialog.Description>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
