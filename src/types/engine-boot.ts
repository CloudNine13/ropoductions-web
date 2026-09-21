/**
 * Engine boot failure vocabulary shared by the injected bridge plugin and the host.
 * Mirrors the save bridge contract in `src/types/save.ts`: one channel, plain
 * objects, and report shapes that both runtimes can produce and validate.
 */

export type EngineBootFailureClass =
  | "webgl_unavailable"
  | "browser_capability"
  | "boot_request_failed"
  | "asset_load_failed"
  | "renderer_init_failed";

export const ENGINE_BOOT_FAILURE_MESSAGE_TYPE = "ROPODUCTIONS_ENGINE_BOOT_FAILURE" as const;
export const ENGINE_READY_MESSAGE_TYPE = "ROPODUCTIONS_ENGINE_READY" as const;

export interface EngineBootDiagnostics {
  /** Failing resource URL, when the report names one. */
  url?: string;
  /** HTTP status of the failing request, when it produced one. */
  status?: number;
  /** Network-level failure detail for a request that produced no status. */
  networkError?: string;
  /** Outcome of the WebGL probe that ran for this boot, when one ran. */
  probeSupported?: boolean;
  /** `webglcontextcreationerror.statusMessage` captured by a probe. */
  statusMessage?: string;
  renderer?: string;
  vendor?: string;
  userAgent?: string;
  /** `script[src]` inventory of the engine document, in document order. */
  engineScripts?: string[];
  /** Retry attempts the plugin spent on the failing asset before giving up. */
  retries?: number;
  /** The asset request was answered 401/403: the session, not the network, failed. */
  sessionRejected?: boolean;
}

export interface EngineBootFailureReport {
  type: typeof ENGINE_BOOT_FAILURE_MESSAGE_TYPE;
  failureClass: EngineBootFailureClass;
  /** Raw engine string behind the classification; never player-facing copy. */
  raw?: string;
  diagnostics?: EngineBootDiagnostics;
}

export interface EngineReadyReport {
  type: typeof ENGINE_READY_MESSAGE_TYPE;
}
