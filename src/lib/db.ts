/**
 * Cloudflare D1 Data Access Layer
 * Parameterized prepared statement helpers for sessions and patron overrides.
 * Strictly adheres to AD-8 (db.prepare().bind()) to eliminate SQL injection risks.
 */

import type {
  OverrideAuditRecord,
  PatronOverrideRecord,
  SessionRecord,
  UpsertPatronOverrideInput,
  UpsertSessionInput,
} from "@/types/database";

/**
 * Audit actor recorded when no human performed the mutation: creator-admin
 * materialization (OAuth login, session validation) and the dev-only admin seed CLI.
 * It is trail data only — authorization never reads `override_audit`, and sealing is
 * decided solely by `patron_overrides.granted_by`.
 */
export const SYSTEM_BOOTSTRAP_ACTOR = "system_bootstrap";

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
 * The mutation and its `override_audit` row are one `db.batch` interaction, so neither
 * can commit without the other. `actorPatronId` is required because attribution is a
 * caller fact the database cannot derive — pass `SYSTEM_BOOTSTRAP_ACTOR` when no human
 * acted, never an env value or a target id.
 *
 * @param db Cloudflare D1 Database binding
 * @param override Override parameters with target role ('admin' or 'comp')
 * @param actorPatronId Acting administrator's Patreon ID, or the system sentinel
 */
export async function upsertPatronOverride(
  db: D1Database,
  override: UpsertPatronOverrideInput,
  actorPatronId: string
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const createdAt = override.created_at_sec ?? now;
  const updatedAt = override.updated_at_sec ?? now;
  const notes = override.notes ?? null;

  await db.batch([
    // Audit first: it derives `action`/`before_role` from the pre-write row, so the
    // batch order is load-bearing. Reordering silently records post-write state.
    db
      .prepare(
        `INSERT INTO override_audit (actor_patron_id, target_patron_id, action, before_role, after_role, created_at_sec)
         SELECT ?1, ?2,
                CASE WHEN (SELECT role FROM patron_overrides WHERE patron_id = ?2) IS NULL THEN 'grant' ELSE 'update' END,
                (SELECT role FROM patron_overrides WHERE patron_id = ?2),
                ?3, ?4`
      )
      .bind(actorPatronId, override.patron_id, override.role, updatedAt),
    db
      .prepare(
        `INSERT INTO patron_overrides (patron_id, role, notes, granted_by, created_at_sec, updated_at_sec)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(patron_id) DO UPDATE SET
           role = excluded.role,
           notes = CASE WHEN ? IS NOT NULL THEN excluded.notes ELSE patron_overrides.notes END,
           -- granted_by is an immutable audit attribution set on INSERT only;
           -- pre-5.4 updates clobbered it, leaving no recoverable trail.
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
      ),
  ]);
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
 * Lists the append-only override audit trail, newest first.
 * Ordering is `created_at_sec` descending with the monotonic row id as tiebreaker so
 * LIMIT/OFFSET paging stays stable when several events share a second.
 *
 * @param db Cloudflare D1 Database binding
 * @param limit Maximum number of trail rows to return
 * @param offset Number of trail rows to skip
 * @returns Array of OverrideAuditRecord
 */
export async function listOverrideAudit(
  db: D1Database,
  limit: number = 25,
  offset: number = 0
): Promise<OverrideAuditRecord[]> {
  const { results } = await db
    .prepare(
      "SELECT * FROM override_audit ORDER BY created_at_sec DESC, id DESC LIMIT ? OFFSET ?"
    )
    .bind(limit, offset)
    .all<OverrideAuditRecord>();

  return results ?? [];
}

/**
 * Deletes a patron override row.
 * Sealing of founder rows is enforced at the action layer (isSealedCreatorAdmin /
 * isCreatorAdmin) before this is reached; the sole-admin *row-count* guard is
 * deliberately absent because the protected invariant is founder access via env
 * bootstrap (Amendment A-2026-09-19-01), not preserving a mutable-admin pool.
 * A `comp` override is always deleted; an `admin` override is deleted too (even
 * the caller's own last one) — founder access does not depend on this row.
 *
 * The deletion and its `override_audit` row are one `db.batch` interaction. The audit
 * statement is batch[0] and inserts only when the row still exists, so a revoke that
 * removes nothing appends nothing.
 *
 * @param db Cloudflare D1 Database binding
 * @param patronId Numeric string Patreon user ID
 * @param actorPatronId Acting administrator's Patreon ID, or the system sentinel
 * @returns Number of rows deleted (0 = target absent)
 */
export async function deletePatronOverrideGuarded(
  db: D1Database,
  patronId: string,
  actorPatronId: string
): Promise<number> {
  const now = Math.floor(Date.now() / 1000);

  const results = await db.batch([
    db
      .prepare(
        `INSERT INTO override_audit (actor_patron_id, target_patron_id, action, before_role, after_role, created_at_sec)
         SELECT ?1, ?2, 'revoke', prev.role, NULL, ?3
         FROM (SELECT (SELECT role FROM patron_overrides WHERE patron_id = ?2) AS role) AS prev
         WHERE prev.role IS NOT NULL`
      )
      .bind(actorPatronId, patronId, now),
    db.prepare("DELETE FROM patron_overrides WHERE patron_id = ?").bind(patronId),
  ]);

  return results[1]?.meta?.changes ?? 0;
}
