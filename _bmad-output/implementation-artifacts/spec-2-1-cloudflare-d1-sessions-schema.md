---
title: 'Story 2.1: Cloudflare D1 Sessions & Overrides Schema Migration'
type: 'feature'
created: '2026-09-16'
status: 'done'
baseline_commit: 'd73fc822907679f4783592f884e40327bab28d5f'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/planning-artifacts/architecture/architecture-ropoductions-web-2026-09-15/ARCHITECTURE-SPINE.md'
  - '_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Cloudflare D1 SQLite database tables for managing user sessions and persistent patron overrides are incomplete in migrations: `migrations/0001_initial_sessions.sql` lacks the `role` column and index, and `migrations/0002_patron_overrides.sql` is missing entirely, preventing server-side token storage and administrative access role assignment.

**Approach:** Update `migrations/0001_initial_sessions.sql` to include `role` (`CHECK(role IN ('admin', 'comp', 'patron'))`, default `'patron'`) and index `idx_sessions_role`, create `migrations/0002_patron_overrides.sql`, export strict TypeScript database models, provide Cloudflare D1 binding helpers, and establish type-safe parameterized prepared statement query helpers (`db.prepare().bind()`).

## Boundaries & Constraints

**Always:**
- Use versioned sequential SQL files under `migrations/` matching Wrangler D1 migration conventions.
- Enforce parameterized prepared statements (`db.prepare().bind()`); never interpolate or concatenate raw values into SQL strings.
- Enforce check constraints at the database level: `role IN ('admin', 'comp', 'patron')` on `sessions`, and `role IN ('admin', 'comp')` on `patron_overrides`.
- Store all token expiry and timestamp values as integer Unix seconds (`*_sec`) and pledge amounts as integer cents (`pledge_cents`).
- Maintain strict Web Fetch API and Cloudflare Workers runtime compatibility; never import Node.js native `fs`, `net`, or `child_process`.
- Primary keys must be UUIDv4 (`id` TEXT PK) for `sessions` and numeric string Patreon user ID (`patron_id` TEXT PK) for `patron_overrides`.

**Never:**
- Never expose Patreon access tokens, refresh tokens, encryption keys, or internal D1 IDs to client-side bundles.
- Never write ad-hoc unparameterized SQL queries or bypass SQLite prepared statements.
- Never modify existing Cloudflare resource binding names (`DB`, `GAME_ASSETS`) in `wrangler.toml`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Apply Initial Sessions Migration | `wrangler d1 migrations apply DB --local` with `0001_initial_sessions.sql` | `sessions` table created with columns `id`, `patron_id`, `email`, `role`, `tier_id`, `tier_name`, `pledge_cents`, `encrypted_access_token`, `encrypted_refresh_token`, `token_expires_at_sec`, `expires_at_sec`, `revoked`, `created_at_sec`, `last_verified_at_sec`, plus 4 indexes | Migration execution halts if syntax invalid |
| Apply Patron Overrides Migration | `wrangler d1 migrations apply DB --local` with `0002_patron_overrides.sql` | `patron_overrides` table created with columns `patron_id` (PK), `role`, `notes`, `granted_by`, `created_at_sec`, `updated_at_sec`, plus `idx_patron_overrides_role` | Migration execution halts if syntax invalid |
| Session Insert with Default Role | Insert session omitting explicit `role` | Row persisted with `role = 'patron'` | N/A |
| Session Insert with Invalid Role | Insert session with `role = 'moderator'` | SQLite `CHECK constraint failed: role IN ('admin', 'comp', 'patron')` | Rejection from D1 driver |
| Patron Override Invalid Role | Insert override with `role = 'patron'` | SQLite `CHECK constraint failed: role IN ('admin', 'comp')` | Rejection from D1 driver |
| Parameterized Lookup by ID | `db.prepare("SELECT * FROM sessions WHERE id = ?").bind(sessionId).first()` | Returns matching `SessionRecord` or `null` without SQL injection risk | Bound parameter sanitization |
| Parameterized Upsert Override | `db.prepare("INSERT INTO patron_overrides (...) VALUES (?, ...) ON CONFLICT(patron_id) DO UPDATE SET ...").bind(...)` | Inserts or updates override row transactionally | Rejects unbindable types |

</frozen-after-approval>

## Code Map

- `migrations/0001_initial_sessions.sql` -- D1 migration defining `sessions` schema, columns, check constraint on `role`, and indexes (`patron_id`, `role`, `expires_at_sec`, `revoked`).
- `migrations/0002_patron_overrides.sql` -- D1 migration defining `patron_overrides` schema (PK `patron_id`), check constraint on `role IN ('admin', 'comp')`, timestamps, and `idx_patron_overrides_role`.
- `wrangler.toml` -- Configuration containing `[[d1_databases]]` binding `DB` for local and remote environments. Unchanged.
- `src/types/database.ts` -- TypeScript type definitions: `PatronRole`, `OverrideRole`, `SessionRecord`, `PatronOverrideRecord`, and helper input types.
- `src/lib/cloudflare.ts` -- Access helper to retrieve `DB` binding from Cloudflare environment context using `@opennextjs/cloudflare`.
- `src/lib/db.ts` -- Data access layer implementing prepared statements for session and override CRUD operations (`getSessionById`, `upsertSession`, `revokeSession`, `getPatronOverride`, `upsertPatronOverride`, `deletePatronOverride`).

## Tasks & Acceptance

**Execution:**
- [x] `migrations/0001_initial_sessions.sql` -- Add `role` column with `CHECK(role IN ('admin', 'comp', 'patron')) DEFAULT 'patron'` and add index `idx_sessions_role` -- Align sessions schema with architecture spine.
- [x] `migrations/0002_patron_overrides.sql` -- Create migration for `patron_overrides` table with `patron_id` PK, `role CHECK(role IN ('admin', 'comp'))`, audit fields, and `idx_patron_overrides_role` -- Store persistent access overrides and staff roles.
- [x] `src/types/database.ts` -- Create strict TypeScript types for database tables and query inputs -- Prevent type mismatches across auth routes and edge handlers.
- [x] `src/lib/cloudflare.ts` -- Create helper module to safely resolve the Cloudflare D1 `DB` binding from context -- Centralize environment binding access.
- [x] `src/lib/db.ts` -- Implement parameterized prepared statements (`db.prepare().bind()`) for session and override operations -- Prevent SQL injection and enforce AD-8.
- [x] `tests/d1-schema.test.ts` -- Create automated verification script/test validating migration application, column schemas, index presence, and prepared statement parameter bindings -- Verify database integrity and prevent regression.

**Acceptance Criteria:**
- Given a Cloudflare D1 database binding named `DB` in `wrangler.toml`
- When executing `wrangler d1 migrations apply DB`
- Then the `sessions` table is created (`migrations/0001_initial_sessions.sql`) with columns for `id`, `patron_id`, `email`, `role` (`CHECK(role IN ('admin', 'comp', 'patron'))`, default `'patron'`), `tier_id`, `tier_name`, `pledge_cents`, `encrypted_access_token`, `encrypted_refresh_token`, `token_expires_at_sec`, `expires_at_sec`, `revoked`, `created_at_sec`, and `last_verified_at_sec`
- And indexes on `sessions` are created for `patron_id`, `role`, `expires_at_sec`, and `revoked`
- And the `patron_overrides` table is created (`migrations/0002_patron_overrides.sql`) with columns for `patron_id` (PK), `role` (`CHECK(role IN ('admin', 'comp'))`), `notes`, `granted_by`, `created_at_sec`, and `updated_at_sec` with an index on `role`
- And all SQL queries in the codebase utilize parameterized prepared statements (`db.prepare().bind()`).

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Reviewer | Finding | Verdict | Evidence / Disposition |
|---|---|---|---|
| BlindHunter-1 | Role overwritten with 'patron' on upsert conflict if omitted | medium | Verified: `upsertSession` defaulted omitted role to 'patron' and updated `role = excluded.role`. Patched with `COALESCE` / preservation. |
| BlindHunter-2 | Revoked status reset to 0 on upsert conflict if omitted | medium | Verified: `upsertSession` defaulted omitted revoked to 0 and updated on conflict. Patched with `MAX(sessions.revoked, excluded.revoked)`. |
| BlindHunter-3 / VerificationGap-4 | Override notes overwritten with NULL on conflict if omitted | medium | Verified: `upsertPatronOverride` updated `notes = excluded.notes`. Patched with `COALESCE(excluded.notes, patron_overrides.notes)`. |
| BlindHunter-4 | TEXT PRIMARY KEY in SQLite allows NULL unless NOT NULL explicit | low | Verified: SQLite allows NULL in TEXT PRIMARY KEY without explicit NOT NULL. Patched migrations to specify NOT NULL. |
| BlindHunter-5 | Missing helper functions for patron_id lookup and batch revocation | low | Verified: `idx_sessions_patron_id` exists; adding `getSessionsByPatronId` and `revokeSessionsByPatronId` improves API completeness. |
| BlindHunter-6 | Anti-SQLi test ran against empty table | medium | Verified: Table was empty after prior delete test. Patched test to populate row and verify anti-SQLi resistance against populated table. |
| BlindHunter-7 / VerificationGap-1 | Created timestamp preservation test passed unchanged timestamp | low | Verified: Passing distinct timestamp in conflict input proves `created_at_sec` was preserved from original row. |
| BlindHunter-8 | CHECK constraint test caught generic error without message check | low | Verified: Patched test to verify error message indicates SQLite CHECK constraint failure. |
| BlindHunter-9 / VerificationGap-2 | D1 schema test not wired into package.json | low | Verified: Added `"test:d1": "tsx tests/verify-d1-schema.ts"` to `package.json` scripts. |
| BlindHunter-10 | listPatronOverrides lacks pagination parameters | low | Verified: Patched with default `limit = 50, offset = 0`. |
| BlindHunter-11 | Extra CHECK constraints on pledge_cents and revoked | false | Refuted: Schema in ARCHITECTURE-SPINE.md lines 229-249 and SPEC.md defines exact columns and types without additional checks. |
| BlindHunter-12 | Missing getGameAssetsBucketSync in cloudflare.ts | low | Verified: Added `getGameAssetsBucketSync` to match `getDatabaseSync`. |
| VerificationGap-3 | Optional field defaults in upsertSession not exercised by tests | low | Verified: Added test case calling `upsertSession` with minimal CreateSessionInput to verify default role ('patron'), revoked (0), and timestamps. |

## Design Notes

All timestamp fields use integer Unix seconds (`Math.floor(Date.now() / 1000)`), denoted by the `_sec` suffix per AD-8 conventions. `pledge_cents` represents currency as integer cents ($5.00 = 500) to prevent floating-point rounding errors.

Sample parameterized prepared statements:
```typescript
// Lookup session by ID
export async function getSessionById(db: D1Database, id: string): Promise<SessionRecord | null> {
  return await db.prepare("SELECT * FROM sessions WHERE id = ?").bind(id).first<SessionRecord>();
}

// Upsert patron override
export async function upsertPatronOverride(
  db: D1Database,
  override: Omit<PatronOverrideRecord, "created_at_sec" | "updated_at_sec">
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT INTO patron_overrides (patron_id, role, notes, granted_by, created_at_sec, updated_at_sec)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(patron_id) DO UPDATE SET
         role = excluded.role,
         notes = excluded.notes,
         granted_by = excluded.granted_by,
         updated_at_sec = excluded.updated_at_sec`
    )
    .bind(override.patron_id, override.role, override.notes, override.granted_by, now, now)
    .run();
}
```

## Verification

**Commands:**
- `npx wrangler d1 migrations apply DB --local` -- expected: Both `0001_initial_sessions.sql` and `0002_patron_overrides.sql` execute with 0 errors.
- `npm run build` -- expected: TypeScript compilation and OpenNext build succeed without errors.
- `npx tsx tests/verify-d1-schema.ts` or test suite -- expected: All schema checks, constraints, and prepared queries succeed against local D1.
