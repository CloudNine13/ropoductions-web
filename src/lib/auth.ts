import type { SessionRecord } from "@/types/database";

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
