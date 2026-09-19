/**
 * Cloudflare D1 Data Access Layer
 * Parameterized prepared statement helpers for sessions and patron overrides.
 * Strictly adheres to AD-8 (db.prepare().bind()) to eliminate SQL injection risks.
 */

import type {
  PatronOverrideRecord,
  SessionRecord,
  UpsertPatronOverrideInput,
  UpsertSessionInput,
} from "@/types/database";

/**
 * Retrieves a session record by its unique UUIDv4 session identifier.
 *
 * @param db Cloudflare D1 Database binding
 * @param id Unique session ID
 * @returns SessionRecord or null if not found
 */
export async function getSessionById(
  db: D1Database,
  id: string
): Promise<SessionRecord | null> {
  const record = await db
    .prepare("SELECT * FROM sessions WHERE id = ?")
    .bind(id)
    .first<SessionRecord>();

  return record ?? null;
}

/**
 * Inserts or updates a patron session in the `sessions` table.
 * On conflict on primary key `id`, updates OAuth tokens, tiers, role, and verification timestamps.
 *
 * @param db Cloudflare D1 Database binding
 * @param session Session payload containing token and patron state
 */
export async function upsertSession(
  db: D1Database,
  session: UpsertSessionInput
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const createdAt = session.created_at_sec ?? now;
  const lastVerifiedAt = session.last_verified_at_sec ?? now;
  const role = session.role ?? "patron";
  const revoked = session.revoked ?? 0;
  const email = session.email ?? null;

  await db
    .prepare(
      `INSERT INTO sessions (
         id, patron_id, email, role, tier_id, tier_name, pledge_cents,
         encrypted_access_token, encrypted_refresh_token, token_expires_at_sec,
         expires_at_sec, revoked, created_at_sec, last_verified_at_sec
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         patron_id = excluded.patron_id,
         email = excluded.email,
         role = CASE WHEN ? IS NOT NULL THEN excluded.role ELSE sessions.role END,
         tier_id = excluded.tier_id,
         tier_name = excluded.tier_name,
         pledge_cents = excluded.pledge_cents,
         encrypted_access_token = excluded.encrypted_access_token,
         encrypted_refresh_token = excluded.encrypted_refresh_token,
         token_expires_at_sec = excluded.token_expires_at_sec,
         expires_at_sec = excluded.expires_at_sec,
         revoked = CASE WHEN ? IS NOT NULL THEN excluded.revoked ELSE sessions.revoked END,
         last_verified_at_sec = excluded.last_verified_at_sec`
    )
    .bind(
      session.id,
      session.patron_id,
      email,
      role,
      session.tier_id,
      session.tier_name,
      session.pledge_cents,
      session.encrypted_access_token,
      session.encrypted_refresh_token,
      session.token_expires_at_sec,
      session.expires_at_sec,
      revoked,
      createdAt,
      lastVerifiedAt,
      session.role !== undefined ? session.role : null,
      session.revoked !== undefined ? session.revoked : null
    )
    .run();
}

/**
 * Transactionally revokes an active session by marking `revoked = 1`.
 *
 * @param db Cloudflare D1 Database binding
 * @param id Unique session ID
 */
export async function revokeSession(
  db: D1Database,
  id: string
): Promise<void> {
  await db
    .prepare("UPDATE sessions SET revoked = 1 WHERE id = ?")
    .bind(id)
    .run();
}

/**
 * Permanently removes a session record from the database.
 *
 * @param db Cloudflare D1 Database binding
 * @param id Unique session ID
 */
export async function deleteSession(
  db: D1Database,
  id: string
): Promise<void> {
  await db
    .prepare("DELETE FROM sessions WHERE id = ?")
    .bind(id)
    .run();
}

/**
 * Retrieves all sessions associated with a specific patron ID.
 *
 * @param db Cloudflare D1 Database binding
 * @param patronId Numeric string Patreon user ID
 * @returns Array of SessionRecord
 */
export async function getSessionsByPatronId(
  db: D1Database,
  patronId: string
): Promise<SessionRecord[]> {
  const { results } = await db
    .prepare("SELECT * FROM sessions WHERE patron_id = ? ORDER BY created_at_sec DESC")
    .bind(patronId)
    .all<SessionRecord>();

  return results ?? [];
}

/**
 * Revokes all sessions belonging to a specific patron ID.
 * Useful when a patron override is deleted or membership is terminated.
 *
 * @param db Cloudflare D1 Database binding
 * @param patronId Numeric string Patreon user ID
 */
export async function revokeSessionsByPatronId(
  db: D1Database,
  patronId: string
): Promise<void> {
  await db
    .prepare("UPDATE sessions SET revoked = 1 WHERE patron_id = ?")
    .bind(patronId)
    .run();
}

/**
 * Retrieves a persistent patron override by patron user ID.
 *
 * @param db Cloudflare D1 Database binding
 * @param patronId Numeric string Patreon user ID
 * @returns PatronOverrideRecord or null if no override exists
 */
export async function getPatronOverride(
  db: D1Database,
  patronId: string
): Promise<PatronOverrideRecord | null> {
  const record = await db
    .prepare("SELECT * FROM patron_overrides WHERE patron_id = ?")
    .bind(patronId)
    .first<PatronOverrideRecord>();

  return record ?? null;
}

/**
 * Creates or updates an administrative or complimentary access override.
 * Preserves initial `created_at_sec` while updating role, notes, and `updated_at_sec`.
 *
 * @param db Cloudflare D1 Database binding
 * @param override Override parameters with target role ('admin' or 'comp')
 */
export async function upsertPatronOverride(
  db: D1Database,
  override: UpsertPatronOverrideInput
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const createdAt = override.created_at_sec ?? now;
  const updatedAt = override.updated_at_sec ?? now;
  const notes = override.notes ?? null;

  await db
    .prepare(
      `INSERT INTO patron_overrides (patron_id, role, notes, granted_by, created_at_sec, updated_at_sec)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(patron_id) DO UPDATE SET
         role = excluded.role,
         notes = CASE WHEN ? IS NOT NULL THEN excluded.notes ELSE patron_overrides.notes END,
         granted_by = excluded.granted_by,
         updated_at_sec = excluded.updated_at_sec`
    )
    .bind(
      override.patron_id,
      override.role,
      notes,
      override.granted_by,
      createdAt,
      updatedAt,
      override.notes !== undefined ? 1 : null
    )
    .run();
}

/**
 * Removes an access override for a given patron ID.
 *
 * @param db Cloudflare D1 Database binding
 * @param patronId Numeric string Patreon user ID
 */
export async function deletePatronOverride(
  db: D1Database,
  patronId: string
): Promise<void> {
  await db
    .prepare("DELETE FROM patron_overrides WHERE patron_id = ?")
    .bind(patronId)
    .run();
}

/**
 * Lists all active patron overrides sorted by creation date descending.
 * Useful for admin dashboard management.
 *
 * @param db Cloudflare D1 Database binding
 * @returns Array of PatronOverrideRecord
 */
export async function listPatronOverrides(
  db: D1Database,
  limit: number = 50,
  offset: number = 0
): Promise<PatronOverrideRecord[]> {
  const { results } = await db
    .prepare("SELECT * FROM patron_overrides ORDER BY created_at_sec DESC LIMIT ? OFFSET ?")
    .bind(limit, offset)
    .all<PatronOverrideRecord>();

  return results ?? [];
}

/**
 * Counts patron overrides holding the `admin` role.
 * Includes both sealed Creator Admins and panel-assigned admins.
 *
 * @param db Cloudflare D1 Database binding
 * @returns Number of admin overrides
 */
export async function countAdminOverrides(db: D1Database): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS count FROM patron_overrides WHERE role = ?")
    .bind("admin")
    .first<{ count: number | string }>();

  return Number(row?.count ?? 0);
}

/**
 * Atomically deletes a patron override while enforcing the sole-admin invariant.
 * A `comp` override is always deletable; an `admin` override is deleted only when
 * at least one other admin override remains. The count subquery and DELETE execute
 * as a single statement, so concurrent revocations cannot drop the system to zero
 * administrators.
 *
 * @param db Cloudflare D1 Database binding
 * @param patronId Numeric string Patreon user ID
 * @returns Number of rows deleted (0 = blocked by the guard or target absent)
 */
export async function deletePatronOverrideGuarded(
  db: D1Database,
  patronId: string
): Promise<number> {
  const result = await db
    .prepare(
      `DELETE FROM patron_overrides
       WHERE patron_id = ?
         AND (
           role = 'comp'
           OR (SELECT COUNT(*) FROM patron_overrides WHERE role = 'admin' AND patron_id != ?) >= 1
         )`
    )
    .bind(patronId, patronId)
    .run();

  return result.meta?.changes ?? 0;
}
