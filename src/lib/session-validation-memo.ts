import { validateSessionAccess, type SessionValidationResult } from "./auth";
import { hashValue } from "./crypto";

/**
 * Amortisation window for a successfully validated session, per
 * `engine-browser-compat.md` §4: one engine boot issues 65+ gated requests and
 * must not cost a D1 validation each.
 */
export const SESSION_VALIDATION_TTL_SEC = 60;

/**
 * Retained authorized verdicts per isolate. Only settled verdicts count: an
 * in-flight validation is never evicted, and it is always removed when it
 * settles, so retention is bounded by this cap plus the request concurrency the
 * runtime allows.
 */
export const SESSION_VALIDATION_MAX_ENTRIES = 256;

export type SessionValidationStatus = SessionValidationResult["status"];

export interface SessionValidationVerdict {
  status: SessionValidationStatus;
}

type DeniedStatus = Exclude<SessionValidationStatus, "authorized">;

/**
 * The memo retains bounds only: the authorized session's own expiry and the
 * window deadline. The session record — its id, which is the session cookie's
 * preimage, and its token ciphertexts — is never stored or handed back.
 */
type Resolution =
  | { authorized: true; sessionExpiresAtSec: number }
  | { authorized: false; status: DeniedStatus };

type MemoEntry =
  | { kind: "settled"; sessionExpiresAtSec: number; expiresAtMs: number }
  | { kind: "pending"; promise: Promise<Resolution> };

export interface SessionValidationMemoOptions {
  ttlSec?: number;
  maxEntries?: number;
  /** Monotonic clock, so a host clock step cannot extend a window. */
  nowMs?: () => number;
  /** Wall clock in whole seconds, matching the session row's own timestamps. */
  nowSec?: () => number;
}

export interface SessionValidationRequest {
  db: D1Database;
  sessionCookie?: string | null;
  sessionSecret?: string;
  initialAdminIds?: string | null;
  /** Wall-clock override, for deterministic callers. */
  nowSec?: number;
}

export interface SessionValidationMemo {
  resolve(request: SessionValidationRequest): Promise<SessionValidationVerdict>;
  /** Retained keys, for inspection; they carry no plaintext material. */
  keys(): string[];
  reset(): void;
}

function verdictFrom(resolution: Resolution, nowSec: number): SessionValidationVerdict {
  if (!resolution.authorized) {
    return { status: resolution.status };
  }
  if (resolution.sessionExpiresAtSec <= nowSec) {
    return { status: "lapsed" };
  }
  return { status: "authorized" };
}

export function createSessionValidationMemo(
  options: SessionValidationMemoOptions = {}
): SessionValidationMemo {
  const ttlMs = (options.ttlSec ?? SESSION_VALIDATION_TTL_SEC) * 1000;
  const maxEntries = options.maxEntries ?? SESSION_VALIDATION_MAX_ENTRIES;
  const monotonicMs = options.nowMs ?? (() => performance.now());
  const wallSec = options.nowSec ?? (() => Math.floor(Date.now() / 1000));
  const entries = new Map<string, MemoEntry>();
  // Bumped by reset() so a validation that was already in flight when the store
  // was cleared cannot write its verdict back into the fresh store.
  let generation = 0;

  // In-flight validations are counted against nothing and evicted never: they
  // remove themselves when they settle, and counting them here would let a
  // burst of cold misses displace live verdicts.
  function evict(): void {
    const now = monotonicMs();
    let settled = 0;
    for (const [key, entry] of entries) {
      if (entry.kind !== "settled") {
        continue;
      }
      if (entry.expiresAtMs <= now) {
        entries.delete(key);
        continue;
      }
      settled++;
    }
    if (settled <= maxEntries) {
      return;
    }
    for (const [key, entry] of entries) {
      if (settled <= maxEntries) {
        return;
      }
      if (entry.kind === "settled") {
        entries.delete(key);
        settled--;
      }
    }
  }

  return {
    keys() {
      return [...entries.keys()];
    },

    reset() {
      generation += 1;
      entries.clear();
    },

    async resolve(request: SessionValidationRequest): Promise<SessionValidationVerdict> {
      const { db, sessionCookie, sessionSecret, initialAdminIds } = request;
      // A reset clears the store and invalidates every validation already running, so
      // the generation is captured before the first await: capturing it after the key
      // hash would let a validation that began before the reset register and write.
      const requestGeneration = generation;
      // One clock for both the verdict and the bounds, so amortisation can never
      // be more permissive than a fresh validation reading the same instant. It
      // is read before the key is registered: a synchronous throw after that
      // point would park a rejected promise under the key forever.
      const validationNowSec = request.nowSec ?? wallSec();
      const wallNow = () => request.nowSec ?? wallSec();

      if (!sessionCookie || !sessionSecret) {
        return {
          status: (
            await validateSessionAccess({
              db,
              sessionCookie,
              sessionSecret,
              initialAdminIds,
              nowSec: validationNowSec,
            })
          ).status,
        };
      }

      const key = await hashValue(`${sessionSecret}:${sessionCookie}`);
      const monotonicNow = monotonicMs();
      const retained = entries.get(key);
      if (retained) {
        if (retained.kind === "pending") {
          return verdictFrom(await retained.promise, wallNow());
        }
        if (retained.expiresAtMs > monotonicNow && retained.sessionExpiresAtSec > wallNow()) {
          return { status: "authorized" };
        }
        entries.delete(key);
      }

      const pendingGeneration = requestGeneration;
      const pending = (async (): Promise<Resolution> => {
        try {
          const result = await validateSessionAccess({
            db,
            sessionCookie,
            sessionSecret,
            initialAdminIds,
            nowSec: validationNowSec,
          });
          if (result.status !== "authorized") {
            if (pendingGeneration === generation) {
              entries.delete(key);
            }
            return { authorized: false, status: result.status };
          }

          const sessionExpiresAtSec = result.session.expires_at_sec;
          const settledAtMs = monotonicMs();
          const expiresAtMs = settledAtMs + ttlMs;
          if (expiresAtMs <= settledAtMs || sessionExpiresAtSec <= wallNow()) {
            if (pendingGeneration === generation) {
              entries.delete(key);
            }
            return { authorized: true, sessionExpiresAtSec };
          }

          // Re-insert so eviction sees most-recently-validated last. A store that
          // was reset while this validation ran is left untouched.
          if (pendingGeneration === generation) {
            entries.delete(key);
            entries.set(key, { kind: "settled", sessionExpiresAtSec, expiresAtMs });
            evict();
          }
          return { authorized: true, sessionExpiresAtSec };
        } catch (error) {
          if (pendingGeneration === generation) {
            entries.delete(key);
          }
          throw error;
        }
      })();

      if (requestGeneration === generation) {
        entries.set(key, { kind: "pending", promise: pending });
        evict();
      }
      return verdictFrom(await pending, wallNow());
    },
  };
}

const sharedMemo = createSessionValidationMemo();

export function resolveSessionValidation(
  request: SessionValidationRequest
): Promise<SessionValidationVerdict> {
  return sharedMemo.resolve(request);
}

/**
 * The shared memo is process-global while the route suites swap the D1 binding
 * between cases, so a verdict validated against one fixture must not survive
 * into the next.
 */
export function resetSessionValidationMemo(): void {
  sharedMemo.reset();
}
