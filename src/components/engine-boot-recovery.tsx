"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown, Copy, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  engineBootDiagnosticsRows,
  formatEngineBootDiagnostics,
  playerCopyClass,
  type EngineBootDiagnosticsLabels,
} from "../lib/engine-boot-failure";
import type { EngineBootFailureReport } from "../types/engine-boot";

export interface EngineBootRecoveryLabels {
  webglTitle?: string;
  webglBody?: string;
  capabilityTitle?: string;
  capabilityBody?: string;
  bootRequestTitle?: string;
  bootRequestBody?: string;
  assetTitle?: string;
  assetBody?: string;
  retry?: string;
  diagnosticsToggle?: string;
  copyDiagnostics?: string;
  copied?: string;
  diagnosticsUrl?: string;
  diagnosticsStatus?: string;
  diagnosticsNetworkError?: string;
  diagnosticsProbe?: string;
  diagnosticsProbeSupported?: string;
  diagnosticsProbeUnsupported?: string;
  diagnosticsStatusMessage?: string;
  diagnosticsRenderer?: string;
  diagnosticsVendor?: string;
  diagnosticsUserAgent?: string;
  diagnosticsScripts?: string;
  diagnosticsForeignScript?: string;
  diagnosticsNone?: string;
}

export interface EngineBootRecoveryProps {
  report: EngineBootFailureReport;
  onRetry: () => void;
  labels?: EngineBootRecoveryLabels;
  className?: string;
}

const COPIED_LABEL_MS = 2000;

function copyFallback(text: string): boolean {
  try {
    if (typeof document === "undefined" || typeof document.createElement !== "function") {
      return false;
    }
    if (typeof document.execCommand !== "function") {
      return false;
    }
    const element = document.createElement("textarea");
    element.value = text;
    element.setAttribute("readonly", "");
    element.style.position = "fixed";
    element.style.opacity = "0";
    document.body.appendChild(element);
    element.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(element);
    return ok;
  } catch {
    return false;
  }
}

export function EngineBootRecovery({
  report,
  onRetry,
  labels,
  className = "",
}: EngineBootRecoveryProps) {
  const t = useTranslations("game");
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<number | null>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const diagnosticsId = useId();

  useEffect(() => {
    retryRef.current?.focus();
  }, []);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  const copyClass = playerCopyClass(report.failureClass);
  const title = {
    webgl_unavailable: labels?.webglTitle ?? t("bootFailure.webglTitle"),
    browser_capability: labels?.capabilityTitle ?? t("bootFailure.capabilityTitle"),
    boot_request_failed: labels?.bootRequestTitle ?? t("bootFailure.bootRequestTitle"),
    asset_load_failed: labels?.assetTitle ?? t("bootFailure.assetTitle"),
  }[copyClass];
  const body = {
    webgl_unavailable: labels?.webglBody ?? t("bootFailure.webglBody"),
    browser_capability: labels?.capabilityBody ?? t("bootFailure.capabilityBody"),
    boot_request_failed: labels?.bootRequestBody ?? t("bootFailure.bootRequestBody"),
    asset_load_failed: labels?.assetBody ?? t("bootFailure.assetBody"),
  }[copyClass];

  const diagnosticsLabels: EngineBootDiagnosticsLabels = {
    url: labels?.diagnosticsUrl ?? t("bootFailure.diagnosticsUrl"),
    status: labels?.diagnosticsStatus ?? t("bootFailure.diagnosticsStatus"),
    networkError: labels?.diagnosticsNetworkError ?? t("bootFailure.diagnosticsNetworkError"),
    probe: labels?.diagnosticsProbe ?? t("bootFailure.diagnosticsProbe"),
    probeSupported: labels?.diagnosticsProbeSupported ?? t("bootFailure.diagnosticsProbeSupported"),
    probeUnsupported:
      labels?.diagnosticsProbeUnsupported ?? t("bootFailure.diagnosticsProbeUnsupported"),
    statusMessage: labels?.diagnosticsStatusMessage ?? t("bootFailure.diagnosticsStatusMessage"),
    renderer: labels?.diagnosticsRenderer ?? t("bootFailure.diagnosticsRenderer"),
    vendor: labels?.diagnosticsVendor ?? t("bootFailure.diagnosticsVendor"),
    userAgent: labels?.diagnosticsUserAgent ?? t("bootFailure.diagnosticsUserAgent"),
    engineScripts: labels?.diagnosticsScripts ?? t("bootFailure.diagnosticsScripts"),
    foreignScript: labels?.diagnosticsForeignScript ?? t("bootFailure.diagnosticsForeignScript"),
    none: labels?.diagnosticsNone ?? t("bootFailure.diagnosticsNone"),
  };

  const rows = engineBootDiagnosticsRows(report, diagnosticsLabels);
  const retryLabel = labels?.retry ?? t("bootFailure.retry");

  const handleCopy = async () => {
    const text = formatEngineBootDiagnostics(report, diagnosticsLabels);
    let ok = false;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      } else {
        ok = copyFallback(text);
      }
    } catch {
      ok = copyFallback(text);
    }
    if (!ok) {
      return;
    }
    setCopied(true);
    if (copiedTimerRef.current !== null) {
      window.clearTimeout(copiedTimerRef.current);
    }
    copiedTimerRef.current = window.setTimeout(() => setCopied(false), COPIED_LABEL_MS);
  };

  return (
    <div
      data-testid="engine-boot-recovery"
      className={`absolute inset-0 z-30 flex items-center justify-center overflow-y-auto bg-black/90 px-4 py-6 ${className}`}
    >
      <section className="w-full max-w-md rounded-xl border border-border/80 bg-card p-5 text-left shadow-2xl">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-tier-gold" aria-hidden="true" />
          <div role="alert" className="min-w-0 flex-1">
            <h2
              data-testid="engine-boot-recovery-title"
              className="text-sm font-semibold text-card-foreground"
            >
              {title}
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{body}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            ref={retryRef}
            data-testid="engine-boot-recovery-retry"
            onClick={onRetry}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none cursor-pointer"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {retryLabel}
          </button>
          <button
            type="button"
            data-testid="engine-boot-recovery-diagnostics-toggle"
            aria-expanded={showDiagnostics}
            aria-controls={diagnosticsId}
            onClick={() => setShowDiagnostics((current) => !current)}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-border/80 px-4 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none cursor-pointer"
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-150 motion-reduce:transition-none ${showDiagnostics ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
            {labels?.diagnosticsToggle ?? t("bootFailure.diagnosticsToggle")}
          </button>
        </div>

        {showDiagnostics && (
          <div id={diagnosticsId} className="mt-3">
            <dl
              data-testid="engine-boot-recovery-diagnostics"
              className="max-h-56 overflow-y-auto border border-border/60 bg-[#090A0F] p-3 font-mono text-[11px] leading-relaxed tabular-nums text-muted-foreground"
            >
              {rows.map((row, index) => (
                <div key={`${row.label}-${index}`} className="flex gap-2">
                  <dt className="shrink-0 text-foreground/70">{row.label}</dt>
                  <dd className="min-w-0 break-all whitespace-pre-wrap">{row.value}</dd>
                </div>
              ))}
            </dl>
            <button
              type="button"
              data-testid="engine-boot-recovery-copy"
              onClick={handleCopy}
              className="mt-2 inline-flex min-h-[44px] items-center gap-2 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none cursor-pointer"
            >
              {copied ? (
                <Check className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4" aria-hidden="true" />
              )}
              <span aria-live="polite">
                {copied
                  ? labels?.copied ?? t("bootFailure.copied")
                  : labels?.copyDiagnostics ?? t("bootFailure.copyDiagnostics")}
              </span>
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
