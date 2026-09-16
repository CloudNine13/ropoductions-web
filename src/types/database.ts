/**
 * Cloudflare D1 Database TypeScript Definitions
 * Ropoductions Web Portal & Patron Game Client
 */

/**
 * Valid roles for authenticated patron sessions in D1 `sessions` table.
 * Check constraint: role IN ('admin', 'comp', 'patron')
 */
export type PatronRole = "admin" | "comp" | "patron";

/**
 * Valid roles for administrative and complimentary overrides in D1 `patron_overrides` table.
 * Check constraint: role IN ('admin', 'comp')
 */
export type OverrideRole = "admin" | "comp";

/**
 * Row record representation for the `sessions` table in Cloudflare D1.
 */
export interface SessionRecord {
  /** Unique session identifier (UUIDv4) */
  id: string;
  /** Numeric string Patreon user ID */
  patron_id: string;
  /** Patron email address if granted by OAuth scope */
  email: string | null;
  /** Access role: admin (studio staff), comp (complimentary), patron (standard backer) */
  role: PatronRole;
  /** Active Patreon tier ID */
  tier_id: string;
  /** Active Patreon tier name (e.g., 'Ork Patron', 'Elf Sybarite') */
  tier_name: string;
  /** Monthly pledge amount represented in integer cents ($5.00 = 500) */
  pledge_cents: number;
  /** AES-256-GCM encrypted Patreon OAuth access token */
  encrypted_access_token: string;
  /** AES-256-GCM encrypted Patreon OAuth refresh token */
  encrypted_refresh_token: string;
  /** Unix timestamp in integer seconds when Patreon OAuth access token expires */
  token_expires_at_sec: number;
  /** Unix timestamp in integer seconds when session cookie/access expires */
  expires_at_sec: number;
  /** Revocation status flag: 0 = active, 1 = revoked */
  revoked: number;
  /** Unix timestamp in integer seconds when session was initially created */
  created_at_sec: number;
  /** Unix timestamp in integer seconds when session was last verified */
  last_verified_at_sec: number;
}

/**
 * Row record representation for the `patron_overrides` table in Cloudflare D1.
 */
export interface PatronOverrideRecord {
  /** Primary key: Numeric string Patreon user ID */
  patron_id: string;
  /** Elevated access role: admin or comp */
  role: OverrideRole;
  /** Administrative audit notes or justification for override */
  notes: string | null;
  /** User ID or identifier of administrator who granted override, or 'system_bootstrap' */
  granted_by: string;
  /** Unix timestamp in integer seconds when override was created */
  created_at_sec: number;
  /** Unix timestamp in integer seconds when override was last updated */
  updated_at_sec: number;
}

/**
 * Input type for creating or upserting a session in D1.
 * Allows optional defaults for `role` (defaults to 'patron'), `revoked` (defaults to 0),
 * `created_at_sec`, and `last_verified_at_sec` (defaulting to current Unix timestamp).
 */
export interface CreateSessionInput {
  id: string;
  patron_id: string;
  email?: string | null;
  role?: PatronRole;
  tier_id: string;
  tier_name: string;
  pledge_cents: number;
  encrypted_access_token: string;
  encrypted_refresh_token: string;
  token_expires_at_sec: number;
  expires_at_sec: number;
  revoked?: number;
  created_at_sec?: number;
  last_verified_at_sec?: number;
}

/**
 * Input type for upserting a session record.
 */
export type UpsertSessionInput = CreateSessionInput | SessionRecord;

/**
 * Input type for creating or upserting a patron override in D1.
 * Omits timestamps or accepts them optionally.
 */
export interface UpsertPatronOverrideInput {
  patron_id: string;
  role: OverrideRole;
  notes?: string | null;
  granted_by: string;
  created_at_sec?: number;
  updated_at_sec?: number;
}
