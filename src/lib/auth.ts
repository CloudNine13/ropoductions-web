import type { CreateSessionInput, SessionRecord } from "@/types/database";
import { getPatronOverride, getSessionById, revokeSession, upsertSession } from "./db";
import { signValue, verifySignedValue } from "./crypto";
import { bootstrapInitialAdminIfEligible } from "./patreon";
import {
  SESSION_COOKIE_MAX_AGE,
  SESSION_COOKIE_NAME,
  serializeCookie,
} from "./cookies";
export interface ApprovedTier {
  name: string;
  cents: number;
}

export const MINIMUM_PLEDGE_CENTS = 500;

export const APPROVED_TIERS: readonly ApprovedTier[] = [
  { name: "Ork Patron", cents: 500 },
  { name: "Ogre Pimp", cents: 1000 },
  { name: "Elf Sybarite", cents: 1500 },
  { name: "Horseman Aesthete", cents: 2500 },
  { name: "Mind Fucker Avatar", cents: 5000 },
] as const;

export function findApprovedTier(
  tierName?: string | null,
  cents?: number | null
): ApprovedTier | undefined {
  if (tierName) {
    const normalizedName = tierName.trim().toLowerCase();
    const byName = APPROVED_TIERS.find(
      (tier) => tier.name.toLowerCase() === normalizedName
    );
    if (byName) {
      if (cents === undefined || cents === null || cents >= byName.cents) {
        return byName;
      }
    }
  }

  if (cents !== undefined && cents !== null) {
    const exact = APPROVED_TIERS.find((tier) => tier.cents === cents);
    if (exact) {
      return exact;
    }
    if (cents >= MINIMUM_PLEDGE_CENTS) {
      return [...APPROVED_TIERS].reverse().find((tier) => cents >= tier.cents);
    }
  }

  return undefined;
}

export function isAccessAuthorized(
  session: SessionRecord | null | undefined,
  nowSec: number = Math.floor(Date.now() / 1000)
): boolean {
  if (!session) {
    return false;
  }

  if (session.role === "admin" || session.role === "comp") {
    return session.revoked === 0 && session.expires_at_sec > nowSec;
  }

  if (session.role === "patron") {
    return (
      session.revoked === 0 &&
      session.expires_at_sec > nowSec &&
      session.pledge_cents >= MINIMUM_PLEDGE_CENTS
    );
  }

  return false;
}

export type SessionValidationResult =
  | { status: "authorized"; session: SessionRecord }
  | { status: "not_found" }
  | { status: "invalid_signature" }
  | { status: "revoked"; session: SessionRecord }
  | { status: "override_deleted"; session: SessionRecord }
  | { status: "lapsed"; session: SessionRecord }
  | { status: "unauthorized"; session: SessionRecord };

export async function validateSessionAccess(options: {
  db: D1Database;
  sessionCookie?: string | null;
  sessionSecret?: string;
  nowSec?: number;
  initialAdminIds?: string | null;
}): Promise<SessionValidationResult> {
  const { db, sessionCookie, sessionSecret, initialAdminIds } = options;
  const nowSec = options.nowSec ?? Math.floor(Date.now() / 1000);

  if (!sessionCookie) {
    return { status: "not_found" };
  }

  if (!sessionSecret) {
    return { status: "invalid_signature" };
  }

  let sessionId = sessionCookie;
  const verified = await verifySignedValue(sessionCookie, sessionSecret);
  if (!verified) {
    return { status: "invalid_signature" };
  }
  sessionId = verified;

  const session = await getSessionById(db, sessionId);
  if (!session) {
    return { status: "not_found" };
  }

  if (session.revoked !== 0) {
    return { status: "revoked", session };
  }

  if (session.expires_at_sec <= nowSec) {
    return { status: "lapsed", session };
  }
  if (session.role === "admin" || session.role === "comp") {
    let override = await getPatronOverride(db, session.patron_id);
    if (!override && initialAdminIds) {
      try {
        const bootstrapped = await bootstrapInitialAdminIfEligible(
          db,
          session.patron_id,
          initialAdminIds
        );
        if (bootstrapped) {
          override = await getPatronOverride(db, session.patron_id);
        }
      } catch {
        // Best-effort bootstrap; does not interrupt session validation
      }
    }
    if (!override) {
      await revokeSession(db, session.id);
      return { status: "override_deleted", session };
    }
    return { status: "authorized", session };
  }

  if (session.role === "patron") {
    if (isAccessAuthorized(session, nowSec)) {
      return { status: "authorized", session };
    }

    if (initialAdminIds) {
      try {
        await bootstrapInitialAdminIfEligible(db, session.patron_id, initialAdminIds);
      } catch {
        // Best-effort bootstrap; does not interrupt session validation
      }
    }

    const override = await getPatronOverride(db, session.patron_id);
    if (override && (override.role === "admin" || override.role === "comp")) {
      const elevatedSession: SessionRecord = {
        ...session,
        role: override.role,
        tier_id: `override_${override.role}`,
        tier_name:
          override.role === "admin" ? "Studio Admin" : "Complimentary Pass",
        expires_at_sec: nowSec + SESSION_COOKIE_MAX_AGE,
        last_verified_at_sec: nowSec,
      };
      try {
        await upsertSession(db, elevatedSession);
      } catch {
        // Elevation persists in memory for this request even if background update fails
      }
      return { status: "authorized", session: elevatedSession };
    }

    return { status: "unauthorized", session };
  }

  return { status: "unauthorized", session };
}

export interface IssueSessionResponseOptions {
  db: D1Database;
  sessionSecret: string;
  patronId: string;
  email?: string | null;
  role: "admin" | "comp" | "patron";
  tierId: string;
  tierName: string;
  pledgeCents: number;
  encryptedAccessToken: string;
  encryptedRefreshToken: string;
  tokenExpiresAtSec: number;
  sessionExpiresAtSec: number;
  nowSec?: number;
  isSecure?: boolean;
  clearCookieHeader: string;
}

export async function issueSessionResponse(
  options: IssueSessionResponseOptions
): Promise<Response> {
  if (!options.sessionSecret || options.sessionSecret.trim() === "") {
    const headers = new Headers();
    headers.set("Location", "/?auth_error=server_configuration_error");
    if (options.clearCookieHeader) {
      headers.append("Set-Cookie", options.clearCookieHeader);
    }
    headers.set("Cache-Control", "no-store, max-age=0");
    return new Response(null, {
      status: 302,
      headers,
    });
  }

  const nowSec = options.nowSec ?? Math.floor(Date.now() / 1000);
  const sessionId = crypto.randomUUID();
  const signedSessionId = await signValue(sessionId, options.sessionSecret);

  const sessionRecord: CreateSessionInput = {
    id: sessionId,
    patron_id: options.patronId,
    email: options.email ?? null,
    role: options.role,
    tier_id: options.tierId,
    tier_name: options.tierName,
    pledge_cents: options.pledgeCents,
    encrypted_access_token: options.encryptedAccessToken,
    encrypted_refresh_token: options.encryptedRefreshToken,
    token_expires_at_sec: options.tokenExpiresAtSec,
    expires_at_sec: options.sessionExpiresAtSec,
    revoked: 0,
    created_at_sec: nowSec,
    last_verified_at_sec: nowSec,
  };

  await upsertSession(options.db, sessionRecord);

  const isSecure = options.isSecure !== false;
  const sessionCookieHeader = serializeCookie(
    SESSION_COOKIE_NAME,
    signedSessionId,
    {
      maxAge: SESSION_COOKIE_MAX_AGE,
      httpOnly: true,
      sameSite: "Lax",
      secure: isSecure,
      path: "/",
    }
  );

  const headers = new Headers();
  headers.set("Location", "/play");
  headers.append("Set-Cookie", options.clearCookieHeader);
  headers.append("Set-Cookie", sessionCookieHeader);
  headers.set("Cache-Control", "no-store, max-age=0");
  return new Response(null, {
    status: 302,
    headers,
  });
}
