import { cache } from "react";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import type { PatronOverrideRecord, SessionRecord } from "@/types/database";
import { validateSessionAccess } from "@/lib/auth";
import { getPatronOverride } from "@/lib/db";
import { bootstrapInitialAdminIfEligible } from "@/lib/patreon";
import { getAuthEnv, getDatabase } from "@/lib/cloudflare";
import { AGE_VERIFIED_COOKIE_NAME, SESSION_COOKIE_NAME, unquoteCookieValue } from "@/lib/cookies";
import {
  PATREON_ID_REGEX,
  PATREON_ID_PATTERN,
  validatePatreonId,
} from "@/lib/patreon-id";

export { PATREON_ID_REGEX, PATREON_ID_PATTERN, validatePatreonId };

/**
 * A creator override is sealed iff its stored bootstrap marker says so.
 * Sealing is decided from the row's stored grant source only — never OR-ed with
 * the live env list at read time (retro item 5), which would silently seal/unseal
 * rows as env toggles. Founder env access is guaranteed by bootstrap
 * materialization (system_bootstrap) independent of this predicate.
 */
export function isSealedCreatorAdmin(override: PatronOverrideRecord): boolean {
  return (
    override.granted_by === "creator_bootstrap" ||
    override.granted_by === "system_bootstrap"
  );
}

export interface ValidateAdminSessionOptions {
  db: D1Database;
  sessionCookie?: string | null;
  ageCookie?: string | null;
  sessionSecret?: string;
  initialAdminIds?: string | null;
  nowSec?: number;
}

export async function validateAdminSession(
  options: ValidateAdminSessionOptions
): Promise<SessionRecord | null> {
  const { db, sessionCookie, ageCookie, sessionSecret, initialAdminIds, nowSec } = options;

  if (!sessionCookie || !sessionSecret) {
    return null;
  }

  // Age verification is strictly required for all studio surfaces
  if (ageCookie !== "true") {
    return null;
  }

  const result = await validateSessionAccess({
    db,
    sessionCookie,
    sessionSecret,
    initialAdminIds,
    nowSec,
  });

  if (result.status !== "authorized") {
    return null;
  }

  let override = await getPatronOverride(db, result.session.patron_id);
  if (!override && initialAdminIds) {
    try {
      const bootstrapped = await bootstrapInitialAdminIfEligible(
        db,
        result.session.patron_id,
        initialAdminIds
      );
      if (bootstrapped) {
        override = await getPatronOverride(db, result.session.patron_id);
      }
    } catch {
      // Fall through to reject
    }
  }

  if (!override || override.role !== "admin") {
    return null;
  }

  return {
    ...result.session,
    role: "admin",
    tier_id: "override_admin",
    tier_name: "Studio Admin",
  };
}

export interface CookieReader {
  get: (name: string) => { value: string } | undefined;
}

export const requireAdminSession = cache(
  async (customCookieStore?: CookieReader): Promise<SessionRecord> => {
    const cookieStore = customCookieStore ?? (await cookies());
    const ageCookie = unquoteCookieValue(cookieStore.get(AGE_VERIFIED_COOKIE_NAME)?.value);
    const sessionCookie = unquoteCookieValue(cookieStore.get(SESSION_COOKIE_NAME)?.value);
    if (!sessionCookie || ageCookie !== "true") {
      notFound();
    }

    let db: D1Database;
    let authEnv;
    try {
      db = await getDatabase();
      authEnv = await getAuthEnv();
    } catch (err) {
      console.error("[requireAdminSession] Infrastructure initialization failed:", err);
      // Fail closed with 404 to avoid leaking route existence on infrastructure failure
      notFound();
    }

    let session: SessionRecord | null = null;
    try {
      session = await validateAdminSession({
        db,
        sessionCookie,
        ageCookie,
        sessionSecret: authEnv.sessionSecret,
        initialAdminIds: authEnv.initialAdminPatreonIds,
      });
    } catch (err) {
      console.error("[requireAdminSession] Session validation failed:", err);
      notFound();
    }

    if (!session) {
      notFound();
    }

    return session;
  }
);