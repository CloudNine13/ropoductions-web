import type { SessionRecord } from "@/types/database";
import { getPatronOverride, getSessionById, revokeSession } from "./db";
import { verifySignedValue } from "./crypto";

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
      return byName;
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
}): Promise<SessionValidationResult> {
  const { db, sessionCookie, sessionSecret } = options;
  const nowSec = options.nowSec ?? Math.floor(Date.now() / 1000);

  if (!sessionCookie) {
    return { status: "not_found" };
  }

  let sessionId = sessionCookie;
  if (sessionSecret) {
    const verified = await verifySignedValue(sessionCookie, sessionSecret);
    if (!verified) {
      return { status: "invalid_signature" };
    }
    sessionId = verified;
  }

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
    const override = await getPatronOverride(db, session.patron_id);
    if (!override) {
      await revokeSession(db, session.id);
      return { status: "override_deleted", session };
    }
    return { status: "authorized", session };
  }

  if (session.role === "patron") {
    if (!isAccessAuthorized(session, nowSec)) {
      return { status: "unauthorized", session };
    }
    return { status: "authorized", session };
  }

  return { status: "unauthorized", session };
}
