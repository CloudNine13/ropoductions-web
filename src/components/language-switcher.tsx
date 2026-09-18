"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Check, ChevronDown, Globe } from "lucide-react";
import { useLocaleSwitcher, type Locale, SUPPORTED_LOCALES } from "@/lib/i18n";
import { useTranslations } from "next-intl";

interface LanguageSwitcherProps {
  placement?: "bottom" | "top";
  className?: string;
}

export function LanguageSwitcher({
  placement = "bottom",
  className = "",
}: LanguageSwitcherProps) {
  const { locale, setLocale, locales } = useLocaleSwitcher();
  const t = useTranslations("language");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuItemsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const activeLocaleInfo = locales[locale] || locales.en;

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const handleSelect = useCallback(
    (nextLocale: Locale) => {
      setLocale(nextLocale);
      setIsOpen(false);
      triggerRef.current?.focus();
    },
    [setLocale]
  );

  // Focus active item when menu opens
  useEffect(() => {
    if (isOpen) {
      const activeIdx = SUPPORTED_LOCALES.indexOf(locale);
      const targetIdx = activeIdx >= 0 ? activeIdx : 0;
      setTimeout(() => {
        menuItemsRef.current[targetIdx]?.focus();
      }, 0);
    }
  }, [isOpen, locale]);

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Handle keyboard navigation (Escape, ArrowUp, ArrowDown, Home, End)
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      const total = SUPPORTED_LOCALES.length;
      const focusedIndex = menuItemsRef.current.findIndex(
        (el) => el === document.activeElement
      );

      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        const nextIndex = focusedIndex >= 0 ? (focusedIndex + 1) % total : 0;
        menuItemsRef.current[nextIndex]?.focus();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        const prevIndex = focusedIndex > 0 ? focusedIndex - 1 : total - 1;
        menuItemsRef.current[prevIndex]?.focus();
      } else if (event.key === "Home") {
        event.preventDefault();
        menuItemsRef.current[0]?.focus();
      } else if (event.key === "End") {
        event.preventDefault();
        menuItemsRef.current[total - 1]?.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const menuPlacementClasses =
    placement === "top"
      ? "bottom-full right-0 mb-2 origin-bottom-right"
      : "top-full right-0 mt-2 origin-top-right";

  return (
    <div ref={containerRef} className={`relative inline-block text-left ${className}`}>
      {/* Trigger Button with Country Flag Emoji */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        className="group inline-flex items-center justify-center gap-2 rounded-lg border border-border/80 bg-card/85 px-3 py-2 text-foreground backdrop-blur-md transition-colors duration-150 motion-reduce:transition-none hover:border-primary/50 hover:bg-card focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px] min-w-[44px] cursor-pointer"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`${t("select")}: ${activeLocaleInfo.nativeName}`}
      >
        <Globe className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span className="text-base leading-none select-none" aria-hidden="true">
          {activeLocaleInfo.flag}
        </span>
        <span className="font-mono text-xs font-bold tracking-wider uppercase text-foreground">
          {activeLocaleInfo.code}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${
            isOpen ? "rotate-180 text-primary" : "group-hover:text-foreground"
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          role="menu"
          aria-orientation="vertical"
          aria-label={t("select")}
          className={`absolute ${menuPlacementClasses} z-50 w-52 rounded-lg border border-border bg-card/95 p-1.5 shadow-2xl backdrop-blur-md space-y-0.5`}
        >
          <div
            role="presentation"
            className="px-3 py-2 text-[10px] font-mono font-bold tracking-widest uppercase text-muted-foreground border-b border-border/60 mb-1"
          >
            {t("select")}
          </div>

          {SUPPORTED_LOCALES.map((locKey, idx) => {
            const loc = locales[locKey];
            const isSelected = locKey === locale;

            return (
              <button
                key={locKey}
                ref={(el) => {
                  menuItemsRef.current[idx] = el;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={isSelected}
                onClick={() => handleSelect(locKey)}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-xs transition-colors duration-150 min-h-[44px] cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary ${
                  isSelected
                    ? "bg-primary/15 text-primary font-bold border border-primary/30"
                    : "text-foreground hover:bg-muted/80 hover:text-foreground border border-transparent"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-lg leading-none select-none shrink-0" aria-hidden="true">
                    {loc.flag}
                  </span>
                  <div className="flex flex-col">
                    <span className="font-medium" lang={locKey}>
                      {loc.nativeName}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground uppercase">
                      {loc.name} ({loc.code})
                    </span>
                  </div>
                </div>

                {isSelected && <Check className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
