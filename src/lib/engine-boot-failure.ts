/**
 * Engine boot failure taxonomy, classification and host-side probing.
 *
 * The taxonomy is the engine browser compatibility classification contract:
 * every player-visible boot failure maps to exactly one class, and the engine's
 * raw error string is diagnostic input only. The injected plugin duplicates this
 * table in plain JS across the runtime boundary.
 */

import {
  ENGINE_BOOT_FAILURE_MESSAGE_TYPE,
  ENGINE_READY_MESSAGE_TYPE,
  type EngineBootDiagnostics,
  type EngineBootFailureClass,
  type EngineBootFailureReport,
} from "../types/engine-boot";

/** Classes that own player-facing copy; `renderer_init_failed` renders as `webgl_unavailable`. */
export type EngineBootCopyClass =
  | "webgl_unavailable"
  | "browser_capability"
  | "boot_request_failed"
  | "asset_load_failed";

export const ENGINE_BOOT_FAILURE_CLASSES: readonly EngineBootFailureClass[] = [
  "webgl_unavailable",
  "browser_capability",
  "boot_request_failed",
  "asset_load_failed",
  "renderer_init_failed",
];

const RAW_SENTENCE_CLASSES: ReadonlyArray<readonly [string, EngineBootFailureClass]> = [
  ["Your browser does not support WebGL.", "webgl_unavailable"],
  ["Your browser does not support Web Audio API.", "browser_capability"],
  ["Your browser does not support CSS Font Loading.", "browser_capability"],
  ["Your browser does not support IndexedDB.", "browser_capability"],
  ["Your browser does not allow to read local files.", "boot_request_failed"],
  ["Failed to initialize graphics.", "renderer_init_failed"],
];

/** MZ and the shipped upstream image guard both phrase resource failures with these. */
const ASSET_LOAD_MARKERS: readonly string[] = ["Failed to load", "has failed to load"];

/** Unclassifiable raw strings still owe the player a surface: the request class covers them. */
export const UNCLASSIFIED_FAILURE_CLASS: EngineBootFailureClass = "boot_request_failed";

export const MAX_ENGINE_BOOT_RAW_CHARS = 2000;
export const MAX_ENGINE_SCRIPT_ENTRIES = 50;
export const MAX_ENGINE_SCRIPT_CHARS = 2000;
export const MAX_ENGINE_DIAGNOSTIC_STRING_CHARS = 2000;

function truncateString(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === "[object Object]"
  );
}

export function classifyEngineBootFailure(raw: unknown): EngineBootFailureClass {
  if (typeof raw !== "string" || raw.trim() === "") {
    return UNCLASSIFIED_FAILURE_CLASS;
  }
  for (const [sentence, failureClass] of RAW_SENTENCE_CLASSES) {
    if (raw.includes(sentence)) {
      return failureClass;
    }
  }
  for (const marker of ASSET_LOAD_MARKERS) {
    if (raw.includes(marker)) {
      return "asset_load_failed";
    }
  }
  return UNCLASSIFIED_FAILURE_CLASS;
}

export function playerCopyClass(failureClass: EngineBootFailureClass): EngineBootCopyClass {
  return failureClass === "renderer_init_failed" ? "webgl_unavailable" : failureClass;
}

/**
 * The engine document must resolve to our own origin: it is the origin whose
 * IndexedDB holds the saves, and the bridge contract only trusts a same-origin
 * frame. A scheme that executes or an address that resolves elsewhere is refused
 * before the frame is created.
 */
export function isSameOriginEngineSrc(value: unknown, baseOrigin: string): boolean {
  if (typeof value !== "string" || value.trim() === "") {
    return false;
  }
  const trimmed = value.trim();
  const lowered = trimmed.toLowerCase();
  if (
    lowered.startsWith("javascript:") ||
    lowered.startsWith("data:") ||
    lowered.startsWith("blob:") ||
    lowered.startsWith("vbscript:")
  ) {
    return false;
  }
  try {
    return new URL(trimmed, `${baseOrigin}/`).origin === baseOrigin;
  } catch {
    return false;
  }
}

export function isEngineBootFailureClass(value: unknown): value is EngineBootFailureClass {
  return ENGINE_BOOT_FAILURE_CLASSES.includes(value as EngineBootFailureClass);
}

export function isEngineBootFailureReport(value: unknown): value is EngineBootFailureReport {
  return (
    isPlainObject(value) &&
    value.type === ENGINE_BOOT_FAILURE_MESSAGE_TYPE &&
    isEngineBootFailureClass(value.failureClass)
  );
}

/**
 * Merges diagnostics parts into one report payload, dropping anything that is not a
 * string, number, boolean or string array. Values from later parts win only when the
 * earlier part left the field unset, so engine-reported detail is never overwritten
 * by a host probe that merely corroborates it.
 */
export function buildDiagnosticsReport(
  ...parts: Array<EngineBootDiagnostics | null | undefined>
): EngineBootDiagnostics {
  const result: EngineBootDiagnostics = {};
  for (const part of parts) {
    if (!part) {
      continue;
    }
    for (const [key, value] of Object.entries(part)) {
      if (value === undefined || value === null) {
        continue;
      }
      if (key in result) {
        continue;
      }
      if (key === "engineScripts") {
        // The inventory is rendered by mapping it, so the boundary drops any other
        // shape instead of letting it reach the recovery surface.
        if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
          (result as Record<string, unknown>)[key] = (value as string[])
            .slice(0, MAX_ENGINE_SCRIPT_ENTRIES)
            .map((entry) => truncateString(entry, MAX_ENGINE_SCRIPT_CHARS));
        }
      } else if (typeof value === "string") {
        (result as Record<string, unknown>)[key] = truncateString(
          value,
          MAX_ENGINE_DIAGNOSTIC_STRING_CHARS
        );
      } else if (typeof value === "number" || typeof value === "boolean") {
        (result as Record<string, unknown>)[key] = value;
      } else if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
        (result as Record<string, unknown>)[key] = (value as string[])
          .slice(0, MAX_ENGINE_SCRIPT_ENTRIES)
          .map((entry) => truncateString(entry, MAX_ENGINE_SCRIPT_CHARS));
      }
    }
  }
  return result;
}

/**
 * Accepts a failure report only when it comes from the engine frame on our own
 * origin. A foreign-origin message, a message from another frame, or a malformed
 * payload is ignored without changing any state.
 */
export function parseEngineBootFailureReport(
  event: Pick<MessageEvent, "origin" | "source" | "data"> | null | undefined,
  expectedSource: Window | null | undefined,
  expectedOrigin: string
): EngineBootFailureReport | null {
  if (!event || !expectedSource) {
    return null;
  }
  if (event.origin !== expectedOrigin) {
    return null;
  }
  if (event.source !== expectedSource) {
    return null;
  }
  if (!isEngineBootFailureReport(event.data)) {
    return null;
  }
  const data = event.data;
  const report: EngineBootFailureReport = {
    type: ENGINE_BOOT_FAILURE_MESSAGE_TYPE,
    failureClass: data.failureClass,
    diagnostics: buildDiagnosticsReport(data.diagnostics),
  };
  if (typeof data.raw === "string" && data.raw) {
    report.raw = truncateString(data.raw, MAX_ENGINE_BOOT_RAW_CHARS);
  }
  return report;
}

/**
 * True when an asset request was answered 401/403: the asset layer must not retry
 * that, and the host revalidates the session instead of offering a blind reload.
 */
export function isSessionRejectedReport(report: EngineBootFailureReport): boolean {
  return report.diagnostics?.sessionRejected === true;
}

/** Ready reports travel the same channel and obey the same source and origin checks. */
export function isEngineReadyReport(
  event: Pick<MessageEvent, "origin" | "source" | "data"> | null | undefined,
  expectedSource: Window | null | undefined,
  expectedOrigin: string
): boolean {
  if (!event || !expectedSource) {
    return false;
  }
  if (event.origin !== expectedOrigin || event.source !== expectedSource) {
    return false;
  }
  return isPlainObject(event.data) && event.data.type === ENGINE_READY_MESSAGE_TYPE;
}

export interface WebglProbeResult {
  supported: boolean;
  statusMessage?: string;
  renderer?: string;
  vendor?: string;
}

/**
 * Probes WebGL the way MZ's `Utils.canUseWebGL` does, but keeps the browser's own
 * `webglcontextcreationerror.statusMessage` and the renderer/vendor strings, and
 * releases the probe context through `WEBGL_lose_context` instead of retaining it.
 */
export function runWebglProbe(
  doc: Document | null | undefined = typeof document === "undefined" ? null : document
): WebglProbeResult {
  if (!doc || typeof doc.createElement !== "function") {
    return { supported: false, statusMessage: "no document available to probe WebGL" };
  }

  const canvas = doc.createElement("canvas");
  let statusMessage: string | undefined;
  const onCreationError = (event: Event) => {
    const message = (event as WebGLContextEvent).statusMessage;
    if (typeof message === "string" && message) {
      statusMessage = message;
    }
  };

  canvas.addEventListener("webglcontextcreationerror", onCreationError);
  let context: WebGLRenderingContext | null = null;
  try {
    // MZ's own gate asks for WebGL1 (`Utils.canUseWebGL`), so the preflight asks
    // for exactly the same context: a WebGL2-only answer would pass here and still
    // fail the engine's own capability check. The cast keeps the DOM's union type
    // from widening the result to a WebGL2 context we no longer request.
    context = canvas.getContext("webgl") as WebGLRenderingContext | null;
  } catch {
    context = null;
  }
  canvas.removeEventListener("webglcontextcreationerror", onCreationError);

  if (!context) {
    return { supported: false, statusMessage };
  }

  let renderer: string | undefined;
  let vendor: string | undefined;
  try {
    const debugInfo = context.getExtension("WEBGL_debug_renderer_info");
    if (debugInfo) {
      const rendererValue = context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
      const vendorValue = context.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
      renderer = typeof rendererValue === "string" ? rendererValue : undefined;
      vendor = typeof vendorValue === "string" ? vendorValue : undefined;
    }
  } catch {
    renderer = undefined;
    vendor = undefined;
  }

  try {
    context.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    // Releasing is best effort: the probe already produced its answer.
  }

  return { supported: true, statusMessage, renderer, vendor };
}

/** Turns a probe outcome into report diagnostics. */
export function webglProbeDiagnostics(probe: WebglProbeResult): EngineBootDiagnostics {
  return buildDiagnosticsReport({
    probeSupported: probe.supported,
    statusMessage: probe.statusMessage,
    renderer: probe.renderer,
    vendor: probe.vendor,
  });
}

export interface EngineBootDiagnosticsLabels {
  url: string;
  status: string;
  networkError: string;
  probe: string;
  probeSupported: string;
  probeUnsupported: string;
  statusMessage: string;
  renderer: string;
  vendor: string;
  userAgent: string;
  engineScripts: string;
  foreignScript: string;
  retries: string;
  sessionRejected: string;
  sessionRejectedValue: string;
  none: string;
}

export interface EngineBootDiagnosticsRow {
  label: string;
  value: string;
}

/** Ordered, labelled diagnostics rows; the clipboard payload is these rows joined. */
export function engineBootDiagnosticsRows(
  report: EngineBootFailureReport,
  labels: EngineBootDiagnosticsLabels
): EngineBootDiagnosticsRow[] {
  const diagnostics = report.diagnostics ?? {};
  const origin = typeof window === "undefined" ? null : window.location.origin;
  const rows: EngineBootDiagnosticsRow[] = [];
  const push = (label: string, value: string | undefined) => {
    if (value !== undefined && value !== "") {
      rows.push({ label, value });
    }
  };

  push(labels.url, diagnostics.url);
  push(labels.status, diagnostics.status === undefined ? undefined : String(diagnostics.status));
  push(labels.networkError, diagnostics.networkError);
  push(labels.retries, diagnostics.retries === undefined ? undefined : String(diagnostics.retries));
  if (diagnostics.sessionRejected === true) {
    rows.push({ label: labels.sessionRejected, value: labels.sessionRejectedValue });
  }

  if (diagnostics.probeSupported !== undefined) {
    push(
      labels.probe,
      diagnostics.probeSupported ? labels.probeSupported : labels.probeUnsupported
    );
  }
  push(labels.statusMessage, diagnostics.statusMessage);
  push(labels.renderer, diagnostics.renderer);
  push(labels.vendor, diagnostics.vendor);
  push(labels.userAgent, diagnostics.userAgent);

  const scripts = diagnostics.engineScripts ?? [];
  if (scripts.length > 0) {
    const described = scripts.map((src) => {
      // Without a known origin nothing can be called off-origin: an unknown
      // origin must never fabricate a foreign-script finding.
      let offOrigin = false;
      if (origin !== null) {
        try {
          offOrigin = new URL(src, origin).origin !== origin;
        } catch {
          offOrigin = true;
        }
      }
      return offOrigin ? `${src} (${labels.foreignScript})` : src;
    });
    rows.push({ label: labels.engineScripts, value: described.join("\n") });
  } else if (diagnostics.engineScripts !== undefined) {
    rows.push({ label: labels.engineScripts, value: labels.none });
  }

  return rows;
}

export function formatEngineBootDiagnostics(
  report: EngineBootFailureReport,
  labels: EngineBootDiagnosticsLabels
): string {
  const header = [
    `class: ${report.failureClass}`,
    report.raw ? `raw: ${report.raw}` : null,
  ].filter((line): line is string => line !== null);
  const rows = engineBootDiagnosticsRows(report, labels).map(
    (row) => `${row.label}: ${row.value}`
  );
  return [...header, ...rows].join("\n");
}
