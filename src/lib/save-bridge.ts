import type {
  SaveSlotsPayload,
  SaveBridgeResponse,
} from "../types/save";

export const ALLOWED_SLOT_REGEX = /^(file([1-9]|1[0-9]|20)|global|config)(\.rpgsave)?$/;

export const DEFAULT_BRIDGE_TIMEOUT_MS = 5000;

export const SAVE_BRIDGE_MESSAGE_TYPES = {
  GET_SAVES: "ROPODUCTIONS_GET_SAVES",
  SAVES_DATA: "ROPODUCTIONS_SAVES_DATA",
  SET_SAVES: "ROPODUCTIONS_SET_SAVES",
  SET_SAVES_SUCCESS: "ROPODUCTIONS_SET_SAVES_SUCCESS",
  RESET_SAVES: "ROPODUCTIONS_RESET_SAVES",
  RESET_SAVES_SUCCESS: "ROPODUCTIONS_RESET_SAVES_SUCCESS",
  SAVE_ERROR: "ROPODUCTIONS_SAVE_ERROR",
} as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === "[object Object]"
  );
}

/**
 * Validates and normalizes save slot keys, stripping optional .rpgsave suffix.
 * Prevents prototype pollution and limits slot range strictly to file1..file20, global, and config.
 */
export function normalizeSlotKey(key: string): string | null {
  if (typeof key !== "string" || !key) {
    return null;
  }
  if (key === "__proto__" || key === "constructor" || key === "prototype") {
    return null;
  }
  if (!ALLOWED_SLOT_REGEX.test(key)) {
    return null;
  }
  return key.replace(/\.rpgsave$/, "");
}

/**
 * Checks whether a given key represents an authorized save slot name.
 */
export function isValidSlotKey(key: string): boolean {
  return normalizeSlotKey(key) !== null;
}

function resolveOrigin(targetOrigin?: string): string {
  const currentOrigin = typeof window !== "undefined" && window.location?.origin ? window.location.origin : "";
  if (!currentOrigin) {
    throw new Error("Unable to resolve origin: window.location.origin is unavailable");
  }
  if (targetOrigin && targetOrigin !== currentOrigin) {
    throw new Error(`Invalid targetOrigin "${targetOrigin}": must equal window.location.origin "${currentOrigin}"`);
  }
  return currentOrigin;
}

function clampTimeout(timeoutMs: number): number {
  if (!Number.isFinite(timeoutMs)) {
    return DEFAULT_BRIDGE_TIMEOUT_MS;
  }
  return Math.max(1, Math.min(timeoutMs, 60000));
}

function createResolvers<T>() {
  if (typeof Promise.withResolvers === "function") {
    return Promise.withResolvers<T>();
  }
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Sends a postMessage request to the engine iframe and waits for the correlated response.
 */
function sendBridgeMessage<T>(
  targetWindow: Window,
  message: { type: string; payload?: unknown; requestId?: string },
  expectedResponseType: string,
  targetOrigin?: string,
  timeoutMs: number = DEFAULT_BRIDGE_TIMEOUT_MS
): Promise<T> {
  const { promise, resolve, reject } = createResolvers<T>();
  const origin = resolveOrigin(targetOrigin);
  const effectiveTimeout = clampTimeout(timeoutMs);
  const requestId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const outgoingMessage = {
    ...message,
    requestId,
  };

  let timer: NodeJS.Timeout | number | null = null;

  const cleanup = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
      window.removeEventListener("message", handleResponse);
    }
  };

  const handleResponse = (event: MessageEvent) => {
    if (!event.source || event.source !== targetWindow) {
      return;
    }
    if (event.origin !== origin) {
      return;
    }

    const data = event.data as SaveBridgeResponse;
    if (!isPlainObject(data) || typeof data.type !== "string") {
      return;
    }

    // Strict requestId equality check: response must correlate strictly to this request
    if (data.requestId !== requestId) {
      return;
    }

    if (data.type === SAVE_BRIDGE_MESSAGE_TYPES.SAVE_ERROR) {
      cleanup();
      const errorMessage =
        typeof data.error === "string" ? data.error : String(data.error ?? "Save bridge operation failed");
      reject(new Error(errorMessage));
      return;
    }

    if (data.type === SAVE_BRIDGE_MESSAGE_TYPES.SAVES_DATA) {
      if (expectedResponseType === SAVE_BRIDGE_MESSAGE_TYPES.SAVES_DATA) {
        cleanup();
        resolve(data.payload as unknown as T);
        return;
      }
    }

    if (data.type === expectedResponseType) {
      cleanup();
      resolve(undefined as T);
      return;
    }
  };

  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("message", handleResponse);
  }

  timer = setTimeout(() => {
    cleanup();
    reject(new Error(`Save bridge request ${message.type} timed out after ${effectiveTimeout}ms`));
  }, effectiveTimeout);

  try {
    targetWindow.postMessage(outgoingMessage, origin);
  } catch (err) {
    cleanup();
    reject(err);
  }

  return promise;
}
export async function requestSaves(
  targetWindow: Window,
  targetOrigin?: string,
  timeoutMs: number = DEFAULT_BRIDGE_TIMEOUT_MS
): Promise<SaveSlotsPayload> {
  return sendBridgeMessage<SaveSlotsPayload>(
    targetWindow,
    { type: SAVE_BRIDGE_MESSAGE_TYPES.GET_SAVES },
    SAVE_BRIDGE_MESSAGE_TYPES.SAVES_DATA,
    targetOrigin,
    timeoutMs
  );
}

/**
 * Restores save slots into the engine iframe via ROPODUCTIONS_SET_SAVES.
 */
export async function restoreSaves(
  targetWindow: Window,
  payload: Record<string, string>,
  targetOrigin?: string,
  timeoutMs: number = DEFAULT_BRIDGE_TIMEOUT_MS
): Promise<void> {
  if (!isPlainObject(payload)) {
    throw new Error("Invalid payload: payload must be a key-value record of save slots");
  }

  const keys = Object.keys(payload);
  if (keys.length === 0) {
    throw new Error("Invalid payload: payload cannot be empty; at least one save slot is required");
  }

  const validNormalizedKeys = keys.map(normalizeSlotKey).filter((k): k is string => k !== null);
  if (validNormalizedKeys.length === 0) {
    throw new Error("Invalid payload: payload contains no valid save slot keys (must match file1..file20, global, or config)");
  }

  await sendBridgeMessage<void>(
    targetWindow,
    { type: SAVE_BRIDGE_MESSAGE_TYPES.SET_SAVES, payload },
    SAVE_BRIDGE_MESSAGE_TYPES.SET_SAVES_SUCCESS,
    targetOrigin,
    timeoutMs
  );
}

/**
 * Purges all save slots in the engine iframe via ROPODUCTIONS_RESET_SAVES.
 */
export async function resetSaves(
  targetWindow: Window,
  targetOrigin?: string,
  timeoutMs: number = DEFAULT_BRIDGE_TIMEOUT_MS
): Promise<void> {
  await sendBridgeMessage<void>(
    targetWindow,
    { type: SAVE_BRIDGE_MESSAGE_TYPES.RESET_SAVES },
    SAVE_BRIDGE_MESSAGE_TYPES.RESET_SAVES_SUCCESS,
    targetOrigin,
    timeoutMs
  );
}
