"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { ErrorReactionIcon } from "@/components/error-reaction-icon";

interface AuthErrorToastProps {
  errorCode: string;
}

export function AuthErrorToast({ errorCode }: AuthErrorToastProps) {
  const [open, setOpen] = useState(true);
  const [mounted, setMounted] = useState(false);
  const t = useTranslations("authError");

  useEffect(() => {
    // Re-open the toast and re-run the enter animation when the error changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(true);
    setMounted(false);
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, [errorCode]);

  const handleDismiss = () => {
    setOpen(false);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("auth_error");
      const nextQuery = url.searchParams.toString();
      const nextUrl = url.pathname + (nextQuery ? `?${nextQuery}` : "") + url.hash;
      window.history.replaceState({}, "", nextUrl);
    }
  };

  if (!open) {
    return null;
  }

  let title = t("genericTitle");
  let desc = t("genericDesc");

  if (errorCode === "client_configuration_error") {
    title = t("clientConfigTitle");
    desc = t("clientConfigDesc");
  } else if (errorCode === "server_configuration_error") {
    title = t("serverConfigTitle");
    desc = t("serverConfigDesc");
  } else if (errorCode === "access_denied") {
    title = t("accessDeniedTitle");
    desc = t("accessDeniedDesc");
  }

  return (
    <aside
      role="alert"
      className={`fixed z-50 transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none max-sm:inset-x-4 max-sm:top-4 max-sm:w-auto sm:bottom-6 sm:right-6 sm:max-w-md w-full pointer-events-none ${
        mounted ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
      }`}
    >
      <div className="pointer-events-auto flex items-start gap-3 rounded-xl border border-destructive/50 bg-card/95 p-4 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.8)] text-foreground">
        <ErrorReactionIcon key={errorCode} />
        <div className="flex-1 min-w-0 pr-1">
          <h3 className="font-display font-semibold text-sm sm:text-base text-destructive">
            {title}
          </h3>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            {desc}
          </p>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 inline-flex h-11 w-11 items-center justify-center -mr-2 -mt-2 rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
          aria-label={t("dismiss")}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
