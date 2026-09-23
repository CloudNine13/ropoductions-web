/**
 * Diagnostic logger for Cloudflare Workers request tracing.
 * [CLEANUP_TAG: CF_DIAGNOSTIC]
 *
 * This module provides structured JSON logging of Cloudflare request metadata,
 * session status, R2 operations, and execution timings.
 * To disable all diagnostic logging globally, set DIAGNOSTIC_LOGGING_ENABLED = false.
 */

import type { NextRequest } from "next/server";

export const DIAGNOSTIC_LOGGING_ENABLED = true;

export interface CloudflareDiagnosticContext {
  rayId?: string | null;
  colo?: string | null;
  ip?: string | null;
  country?: string | null;
  userAgent?: string | null;
  method?: string;
  url?: string;
  path?: string;
  range?: string | null;
  ifNoneMatch?: string | null;
}

export function extractCloudflareContext(request: NextRequest): CloudflareDiagnosticContext {
  const headers = request.headers;
  const cf = (request as unknown as { cf?: Record<string, unknown> }).cf;

  return {
    rayId: headers.get("cf-ray"),
    colo: typeof cf?.colo === "string" ? cf.colo : null,
    ip: headers.get("cf-connecting-ip"),
    country: headers.get("cf-ipcountry"),
    userAgent: headers.get("user-agent"),
    method: request.method,
    url: request.url,
    path: request.nextUrl.pathname,
    range: headers.get("range"),
    ifNoneMatch: headers.get("if-none-match"),
  };
}

export function logCloudflareDiagnostic(
  tag: string,
  data: Record<string, unknown>,
  level: "info" | "warn" | "error" = "info"
): void {
  if (!DIAGNOSTIC_LOGGING_ENABLED) return;

  const payload = {
    diagnosticTag: tag,
    timestamp: new Date().toISOString(),
    ...data,
  };

  const message = `[CF_DIAGNOSTIC][${tag}] ${JSON.stringify(payload)}`;
  if (level === "error") {
    console.error(message);
  } else if (level === "warn") {
    console.warn(message);
  } else {
    console.info(message);
  }
}
