import { cache } from "react";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import type { PatronOverrideRecord, SessionRecord } from "@/types/database";
import { validateSessionAccess } from "@/lib/auth";
import { getPatronOverride } from "@/lib/db";
import { bootstrapInitialAdminIfEligible, isCreatorAdmin } from "@/lib/patreon";
import { getAuthEnv, getDatabase } from "@/lib/cloudflare";
import { AGE_VERIFIED_COOKIE_NAME, SESSION_COOKIE_NAME, unquoteCookieValue } from "@/lib/cookies";

export const ADMIN_BACKGROUND_COLOR = "#090A0F";
export const ADMIN_CARD_SURFACE = "#121522";
export const ADMIN_BORDER_COLOR = "#23283E";
export const ADMIN_BADGE_GOLD = "#FBBF24";
export const ADMIN_ROLE_ADMIN_COLOR = "#FBBF24";
export const ADMIN_ROLE_COMP_COLOR = "#38BDF8";
export const ADMIN_CREATOR_TIER_LABEL = "Creator Admin (Sealed)";
export const ADMIN_PANEL_TIER_LABEL = "Panel Admin";

export const PATREON_ID_REGEX = /^\d{1,20}$/;

export function validatePatreonId(patronId: string): boolean {
  return PATREON_ID_REGEX.test(patronId);
}

export function isSealedCreatorAdmin(
  override: PatronOverrideRecord,
  creatorAdminIds?: string | null
): boolean {
  if (
    override.granted_by === "creator_bootstrap" ||
    override.granted_by === "system_bootstrap"
  ) {
    return true;
  }
  if (creatorAdminIds && isCreatorAdmin(override.patron_id, creatorAdminIds)) {
    return true;
  }
  return false;
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
