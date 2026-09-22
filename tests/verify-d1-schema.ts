/**
 * Comprehensive Automated Verification for Cloudflare D1 Database Schema
 * Validates:
 * 1. Table schemas for `sessions` and `patron_overrides`
 * 2. Column names, types, constraints, and defaults
 * 3. Required indexes presence and configuration
 * 4. SQLite CHECK constraints (`role IN ('admin', 'comp', 'patron')`, `role IN ('admin', 'comp')`)
 * 5. Parameterized prepared statements CRUD functions in `src/lib/db.ts`
 * 6. SQL injection resistance via prepared parameter binding
 * 7. `override_audit` schema: columns, indexes, and the append-only triggers
 * 8. Override audit behaviour on an isolated throwaway database: grant/update/revoke derivation,
 *    no-op revocations, batch atomicity, trigger-enforced append-only, CHECK rejections, and
 *    stable newest-first LIMIT/OFFSET paging
 *
 * The audit trail is append-only by trigger, so the audit schema step only reads and every audit
 * write runs against a throwaway database created by this file.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getPlatformProxy, type PlatformProxy } from "wrangler";
import {
  SYSTEM_BOOTSTRAP_ACTOR,
  countAdminOverrides,
  deletePatronOverrideGuarded,
  deleteSession,
  getPatronOverride,
  getSessionById,
  getSessionsByPatronId,
  listOverrideAudit,
  listPatronOverrides,
  revokeSession,
  revokeSessionsByPatronId,
  upsertPatronOverride,
  upsertSession,
} from "../src/lib/db";
import type { OverrideAuditRecord, SessionRecord } from "../src/types/database";

/**
 * Audit actor for panel-driven mutations: a numeric Patreon id, never the mutated target.
 * Bootstrap paths pass `SYSTEM_BOOTSTRAP_ACTOR` instead.
 */
const grantingAdminId = "11111111";

interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

interface IndexInfo {
  name: string;
  unique: number;
  origin: string;
  partial: number;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    console.error(`Assertion failed: ${message}`);
    throw new Error(message);
  }
}

/**
 * Asserts that an operation is rejected. `expectedDetail` pins the reason when the rejection
 * kind matters (a CHECK violation reads differently from a trigger abort).
 */
async function expectRejection(
  action: () => Promise<unknown>,
  message: string,
  expectedDetail?: string
): Promise<void> {
  try {
    await action();
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    if (expectedDetail !== undefined) {
      assert(
        text.toLowerCase().includes(expectedDetail.toLowerCase()),
        `${message} (rejected with an unexpected error: ${text})`
      );
    }
    return;
  }
  assert(false, message);
}

/**
 * Proves the audit trail's runtime properties — row derivation, batch atomicity, trigger-enforced
 * append-only, CHECK rejections and paging — against a throwaway database built by applying the
 * real migrations through the real wrangler path. The shared local database cannot host these
 * checks: audit rows are permanent by design, so a write there would pollute every consumer of
 * `.wrangler/state/v3`.
 */
async function verifyAuditBehaviour(sharedDb: D1Database): Promise<void> {
  const stateRoot = mkdtempSync(join(tmpdir(), "ropoductions-audit-"));
  let proxy: PlatformProxy | null = null;

  try {
    // `wrangler --persist-to <dir>` nests its state under a `v3` segment, so the proxy must be
    // pointed at that inner directory: `path: stateRoot` would open a different, empty database.
    execFileSync(
      "npx",
      ["wrangler", "d1", "migrations", "apply", "DB", "--local", "--persist-to", stateRoot],
      { stdio: "ignore" }
    );
    proxy = await getPlatformProxy({ persist: { path: join(stateRoot, "v3") } });
    const db = proxy.env.DB as D1Database;

    const migrated = await db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'override_audit'")
      .first<{ name: string }>();
    assert(
      migrated !== null,
      "Throwaway database must expose 'override_audit' after `wrangler d1 migrations apply`"
    );
    console.log("  PASS: Real migrations applied to a throwaway database through the wrangler CLI.");

    const countRows = async (table: "override_audit" | "patron_overrides"): Promise<number> => {
      const row = await db
        .prepare(`SELECT COUNT(*) AS count FROM ${table}`)
        .first<{ count: number | string }>();
      return Number(row?.count ?? 0);
    };
    const auditRowsFor = async (targetPatronId: string): Promise<OverrideAuditRecord[]> => {
      const { results } = await db
        .prepare("SELECT * FROM override_audit WHERE target_patron_id = ? ORDER BY id ASC")
        .bind(targetPatronId)
        .all<OverrideAuditRecord>();
      return results ?? [];
    };

    const stamp = Date.now();

    // 10.1 Grant: before_role is derived by the database (no prior row) and the actor is recorded.
    const grantedTarget = `audit-${stamp}-grant`;
    await upsertPatronOverride(
      db,
      {
        patron_id: grantedTarget,
        role: "admin",
        notes: "Audit trail grant fixture",
        granted_by: grantingAdminId,
        created_at_sec: 1700000000,
        updated_at_sec: 1700000000,
      },
      grantingAdminId
    );

    const grantRows = await auditRowsFor(grantedTarget);
    assert(grantRows.length === 1, `A grant must append exactly one audit row, got ${grantRows.length}`);
    assert(grantRows[0].action === "grant", `Grant action expected 'grant', got '${grantRows[0].action}'`);
    assert(grantRows[0].before_role === null, "Grant audit row must carry before_role = null");
    assert(grantRows[0].after_role === "admin", `Grant after_role expected 'admin', got '${grantRows[0].after_role}'`);
    assert(grantRows[0].actor_patron_id === grantingAdminId, "Grant audit row must record the passed actor");
    assert(grantRows[0].target_patron_id === grantedTarget, "Grant audit row must record the mutated target");
    console.log("  PASS: Grant wrote one 'grant' row (before_role null, after_role = written role, actor recorded).");

    // 10.2 Update: before_role comes from the pre-write row, not from the caller.
    await upsertPatronOverride(
      db,
      {
        patron_id: grantedTarget,
        role: "comp",
        notes: "Audit trail update fixture",
        granted_by: grantingAdminId,
        created_at_sec: 1700000000,
        updated_at_sec: 1700000100,
      },
      grantingAdminId
    );

    const updateRows = await auditRowsFor(grantedTarget);
    assert(updateRows.length === 2, `An update must append exactly one new audit row, got ${updateRows.length}`);
    const updateRow = updateRows[1];
    assert(updateRow.action === "update", `Update audit action expected 'update', got '${updateRow.action}'`);
    assert(updateRow.before_role === "admin", `Update before_role must be the pre-write role, got '${updateRow.before_role}'`);
    assert(updateRow.after_role === "comp", `Update after_role expected 'comp', got '${updateRow.after_role}'`);
    console.log("  PASS: Update wrote one 'update' row with database-derived before_role ('admin' -> 'comp').");

    // 10.3 Revoke: one row, before_role set, after_role null.
    const revokedChanges = await deletePatronOverrideGuarded(db, grantedTarget, grantingAdminId);
    assert(revokedChanges === 1, `Revoking an existing override must return 1, got ${revokedChanges}`);
    const revokeRows = await auditRowsFor(grantedTarget);
    assert(revokeRows.length === 3, `A revoke must append exactly one audit row, got ${revokeRows.length}`);
    const revokeRow = revokeRows[2];
    assert(revokeRow.action === "revoke", `Revoke audit action expected 'revoke', got '${revokeRow.action}'`);
    assert(revokeRow.before_role === "comp", `Revoke before_role must be the deleted role, got '${revokeRow.before_role}'`);
    assert(revokeRow.after_role === null, "Revoke audit row must carry after_role = null");
    console.log("  PASS: Revoke wrote one 'revoke' row (before_role set, after_role null) and returned 1.");

    // 10.4 Revoking an absent target is a no-op on both sides.
    const absentTarget = `audit-${stamp}-absent`;
    const auditCountBeforeNoop = await countRows("override_audit");
    const absentChanges = await deletePatronOverrideGuarded(db, absentTarget, grantingAdminId);
    assert(absentChanges === 0, `Revoking an absent override must return 0, got ${absentChanges}`);
    assert(
      (await countRows("override_audit")) === auditCountBeforeNoop,
      "Revoking an absent override must not append an audit row"
    );
    console.log("  PASS: Revoking an absent override returned 0 and appended no audit row.");

    // 10.5 Append-only triggers fire on a populated table.
    const sealedId = grantRows[0].id;
    await expectRejection(
      () => db.prepare("UPDATE override_audit SET actor_patron_id = ? WHERE id = ?").bind(grantingAdminId, sealedId).run(),
      "UPDATE on a populated override_audit must be aborted by trg_override_audit_no_update",
      "append-only"
    );
    await expectRejection(
      () => db.prepare("DELETE FROM override_audit WHERE id = ?").bind(sealedId).run(),
      "DELETE on a populated override_audit must be aborted by trg_override_audit_no_delete",
      "append-only"
    );
    console.log("  PASS: Append-only triggers aborted both UPDATE and DELETE on override_audit.");

    // 10.6 CHECK constraints on action, roles and actor identity.
    const insertAuditRow = (actor: string, action: string, beforeRole: string | null, afterRole: string | null) =>
      db
        .prepare(
          `INSERT INTO override_audit (actor_patron_id, target_patron_id, action, before_role, after_role, created_at_sec)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
        )
        .bind(actor, `audit-${stamp}-rejected`, action, beforeRole, afterRole, 1);

    await expectRejection(
      () => insertAuditRow(grantingAdminId, "delete", null, "admin").run(),
      "Audit action outside ('grant', 'update', 'revoke') must be rejected",
      "CHECK"
    );
    await expectRejection(
      () => insertAuditRow(grantingAdminId, "update", "patron", "admin").run(),
      "Audit before_role outside ('admin', 'comp') must be rejected",
      "CHECK"
    );
    await expectRejection(
      () => insertAuditRow(grantingAdminId, "update", "admin", "patron").run(),
      "Audit after_role outside ('admin', 'comp') must be rejected",
      "CHECK"
    );
    await expectRejection(
      () => insertAuditRow("CREATOR_ADMIN_PATREON_IDS", "grant", null, "admin").run(),
      "Audit actor that is neither numeric nor 'system_bootstrap' must be rejected",
      "CHECK"
    );
    await expectRejection(
      () => insertAuditRow("0", "grant", null, "admin").run(),
      "Audit actor '0' must not satisfy the numeric actor GLOB",
      "CHECK"
    );
    await insertAuditRow(SYSTEM_BOOTSTRAP_ACTOR, "grant", null, "admin").run();
    console.log("  PASS: Audit CHECK constraints rejected invalid action, roles and actors; 'system_bootstrap' accepted.");

    // 10.7 Ordering and paging: same-second rows must break ties by descending id.
    const tieSecond = 9999999999;
    const tiedTargets = [`audit-${stamp}-tie-a`, `audit-${stamp}-tie-b`, `audit-${stamp}-tie-c`];
    const tiedRoles = ["admin", "comp", "admin"] as const;
    for (const [index, target] of tiedTargets.entries()) {
      await upsertPatronOverride(
        db,
        {
          patron_id: target,
          role: tiedRoles[index],
          granted_by: grantingAdminId,
          created_at_sec: tieSecond,
          updated_at_sec: tieSecond,
        },
        grantingAdminId
      );
    }

    const fullPage = await listOverrideAudit(db, 50, 0);
    assert(fullPage.length >= 4, `Audit trail must hold at least 4 rows for paging, got ${fullPage.length}`);
    assert(
      fullPage.every(
        (row, index) =>
          index === 0 ||
          fullPage[index - 1].created_at_sec > row.created_at_sec ||
          (fullPage[index - 1].created_at_sec === row.created_at_sec && fullPage[index - 1].id > row.id)
      ),
      "listOverrideAudit must order by created_at_sec DESC with the row id as tiebreak"
    );

    const tiedSlice = fullPage.filter((row) => row.created_at_sec === tieSecond);
    assert(tiedSlice.length === tiedTargets.length, `Tie fixtures must share one audit second; matched ${tiedSlice.length} rows`);
    assert(
      tiedSlice.map((row) => row.target_patron_id).join(",") === [...tiedTargets].reverse().join(","),
      `Same-second rows must be newest-write-first, got [${tiedSlice.map((row) => row.target_patron_id).join(", ")}]`
    );

    const firstWindow = await listOverrideAudit(db, 2, 0);
    const secondWindow = await listOverrideAudit(db, 2, 2);
    assert(firstWindow.length === 2, `LIMIT 2 must return 2 rows, got ${firstWindow.length}`);
    assert(secondWindow.length === 2, `LIMIT 2 OFFSET 2 must return the next 2 rows, got ${secondWindow.length}`);
    assert(
      [...firstWindow, ...secondWindow].map((row) => row.id).join(",") ===
        fullPage.slice(0, 4).map((row) => row.id).join(","),
      "LIMIT/OFFSET windows must replay the head of the full trail without overlap"
    );
    console.log("  PASS: listOverrideAudit returned newest-first with an id tiebreak and honoured LIMIT/OFFSET.");

    // 10.8 Atomicity: the audit statement runs first, so a rollback here proves that already
    // executed work in the batch is discarded, not merely that the batch aborts up front.
    const auditCountBeforeAtomic = await countRows("override_audit");
    const overrideCountBeforeAtomic = await countRows("patron_overrides");
    assert(
      auditCountBeforeAtomic > 0 && overrideCountBeforeAtomic > 0,
      "Atomicity check requires populated tables; an empty baseline would make the comparison vacuous"
    );

    await expectRejection(
      () =>
        db.batch([
          db
            .prepare(
              `INSERT INTO override_audit (actor_patron_id, target_patron_id, action, before_role, after_role, created_at_sec)
               VALUES (?1, ?2, 'grant', NULL, 'admin', ?3)`
            )
            .bind(grantingAdminId, `audit-${stamp}-atomic-audit`, 1700000200),
          db
            .prepare(
              `INSERT INTO patron_overrides (patron_id, role, notes, granted_by, created_at_sec, updated_at_sec)
               VALUES (?1, 'patron', NULL, ?2, ?3, ?3)`
            )
            .bind(`audit-${stamp}-atomic`, grantingAdminId, 1700000200),
        ]),
      "A batch whose override mutation violates CHECK(role IN ('admin', 'comp')) must throw"
    );
    assert(
      (await countRows("override_audit")) === auditCountBeforeAtomic,
      "A failed batch must roll back the audit row it had already inserted"
    );
    assert(
      (await countRows("patron_overrides")) === overrideCountBeforeAtomic,
      "A failed batch must not leave the rejected override row behind"
    );
    console.log("  PASS: Failed batch was atomic — the earlier audit insert rolled back with the rejected mutation.");

    // 10.9 The whole step must stay inside the throwaway database. A `persist.path` that misses the
    // `v3` nesting opens a different database, and a path mistake would write into the shared one.
    const leaked = await sharedDb
      .prepare("SELECT COUNT(*) AS count FROM override_audit WHERE target_patron_id LIKE ?")
      .bind(`audit-${stamp}-%`)
      .first<{ count: number | string }>();
    assert(
      Number(leaked?.count ?? 0) === 0,
      "Audit fixtures must never reach the shared local database"
    );
    console.log("  PASS: Audit fixtures stayed in the throwaway database; the shared database holds none of them.");
  } finally {
    await proxy?.dispose();
    rmSync(stateRoot, { recursive: true, force: true });
  }
}

async function runVerification() {
  console.log("==================================================");
  console.log("Cloudflare D1 schema and query verification started.");
  console.log("==================================================");

  const proxy = await getPlatformProxy();
  const db = proxy.env.DB as D1Database;

  assert(db, "Cloudflare D1 'DB' binding must be accessible via getPlatformProxy()");

  try {
    // ----------------------------------------------------
    // Step 1: Verify Table Existence
    // ----------------------------------------------------
    console.log("\nStep 1: Table existence verification.");
    const { results: tables } = await db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all<{ name: string }>();

    const tableNames = new Set(tables.map((t) => t.name));
    assert(tableNames.has("sessions"), "Table 'sessions' must exist in D1 database");
    assert(tableNames.has("patron_overrides"), "Table 'patron_overrides' must exist in D1 database");
    assert(tableNames.has("override_audit"), "Table 'override_audit' must exist in D1 database");
    console.log("  PASS: Tables 'sessions', 'patron_overrides' and 'override_audit' confirmed present.");

    // ----------------------------------------------------
    // Step 2: Verify `sessions` Column Schema
    // ----------------------------------------------------
    console.log("\nStep 2: 'sessions' column verification.");
    const { results: sessionCols } = await db
      .prepare("PRAGMA table_info(sessions)")
      .all<ColumnInfo>();

    const sessionColMap = new Map(sessionCols.map((c) => [c.name, c]));

    const expectedSessionCols: Record<string, { type: string; notnull: number; pk: number }> = {
      id: { type: "TEXT", notnull: 0, pk: 1 }, // PRIMARY KEY in SQLite PRAGMA has pk=1
      patron_id: { type: "TEXT", notnull: 1, pk: 0 },
      email: { type: "TEXT", notnull: 0, pk: 0 },
      role: { type: "TEXT", notnull: 1, pk: 0 },
      tier_id: { type: "TEXT", notnull: 1, pk: 0 },
      tier_name: { type: "TEXT", notnull: 1, pk: 0 },
      pledge_cents: { type: "INTEGER", notnull: 1, pk: 0 },
      encrypted_access_token: { type: "TEXT", notnull: 1, pk: 0 },
      encrypted_refresh_token: { type: "TEXT", notnull: 1, pk: 0 },
      token_expires_at_sec: { type: "INTEGER", notnull: 1, pk: 0 },
      expires_at_sec: { type: "INTEGER", notnull: 1, pk: 0 },
      revoked: { type: "INTEGER", notnull: 1, pk: 0 },
      created_at_sec: { type: "INTEGER", notnull: 1, pk: 0 },
      last_verified_at_sec: { type: "INTEGER", notnull: 1, pk: 0 },
    };

    for (const [colName, expected] of Object.entries(expectedSessionCols)) {
      const col = sessionColMap.get(colName);
      assert(col, `Column '${colName}' must exist in table 'sessions'`);
      assert(
        col.type.toUpperCase() === expected.type,
        `Column '${colName}' expected type '${expected.type}', got '${col.type}'`
      );
      if (expected.notnull) {
        assert(col.notnull === 1, `Column '${colName}' must be NOT NULL`);
      }
      if (expected.pk) {
        assert(col.pk === 1, `Column '${colName}' must be PRIMARY KEY`);
      }
    }

    const roleCol = sessionColMap.get("role")!;
    assert(
      roleCol.dflt_value === "'patron'",
      `Column 'role' default value expected "'patron'", got "${roleCol.dflt_value}"`
    );
    console.log(`  PASS: All 14 'sessions' columns verified with correct types and constraints.`);

    // ----------------------------------------------------
    // Step 3: Verify `sessions` Indexes
    // ----------------------------------------------------
    console.log("\nStep 3: 'sessions' index verification.");
    const { results: sessionIndexes } = await db
      .prepare("PRAGMA index_list(sessions)")
      .all<IndexInfo>();

    const sessionIndexNames = new Set(sessionIndexes.map((idx) => idx.name));
    const requiredSessionIndexes = [
      "idx_sessions_patron_id",
      "idx_sessions_role",
      "idx_sessions_expires_at_sec",
      "idx_sessions_revoked",
    ];

    for (const idx of requiredSessionIndexes) {
      assert(sessionIndexNames.has(idx), `Index '${idx}' must exist on table 'sessions'`);
    }
    console.log(`  PASS: All 4 required 'sessions' indexes verified: ${requiredSessionIndexes.join(", ")}`);

    // ----------------------------------------------------
    // Step 4: Verify `patron_overrides` Column Schema
    // ----------------------------------------------------
    console.log("\nStep 4: 'patron_overrides' column verification.");
    const { results: overrideCols } = await db
      .prepare("PRAGMA table_info(patron_overrides)")
      .all<ColumnInfo>();

    const overrideColMap = new Map(overrideCols.map((c) => [c.name, c]));

    const expectedOverrideCols: Record<string, { type: string; notnull: number; pk: number }> = {
      patron_id: { type: "TEXT", notnull: 0, pk: 1 },
      role: { type: "TEXT", notnull: 1, pk: 0 },
      notes: { type: "TEXT", notnull: 0, pk: 0 },
      granted_by: { type: "TEXT", notnull: 1, pk: 0 },
      created_at_sec: { type: "INTEGER", notnull: 1, pk: 0 },
      updated_at_sec: { type: "INTEGER", notnull: 1, pk: 0 },
    };

    for (const [colName, expected] of Object.entries(expectedOverrideCols)) {
      const col = overrideColMap.get(colName);
      assert(col, `Column '${colName}' must exist in table 'patron_overrides'`);
      assert(
        col.type.toUpperCase() === expected.type,
        `Column '${colName}' expected type '${expected.type}', got '${col.type}'`
      );
      if (expected.notnull) {
        assert(col.notnull === 1, `Column '${colName}' must be NOT NULL`);
      }
      if (expected.pk) {
        assert(col.pk === 1, `Column '${colName}' must be PRIMARY KEY`);
      }
    }
    console.log(`  PASS: All 6 'patron_overrides' columns verified with correct types and constraints.`);

    // ----------------------------------------------------
    // Step 5: Verify `patron_overrides` Indexes
    // ----------------------------------------------------
    console.log("\nStep 5: 'patron_overrides' index verification.");
    const { results: overrideIndexes } = await db
      .prepare("PRAGMA index_list(patron_overrides)")
      .all<IndexInfo>();

    const overrideIndexNames = new Set(overrideIndexes.map((idx) => idx.name));
    assert(
      overrideIndexNames.has("idx_patron_overrides_role"),
      "Index 'idx_patron_overrides_role' must exist on table 'patron_overrides'"
    );
    console.log("  PASS: Index 'idx_patron_overrides_role' verified.");

    // ----------------------------------------------------
    // Step 6: Verify SQLite CHECK Constraints
    // ----------------------------------------------------
    console.log("\nStep 6: Check constraint verification.");

    // Test valid session role values: 'admin', 'comp', 'patron'
    for (const validRole of ["admin", "comp", "patron"] as const) {
      const testId = `test-role-${validRole}-${Date.now()}`;
      await db
        .prepare(
          `INSERT INTO sessions (
             id, patron_id, role, tier_id, tier_name, pledge_cents,
             encrypted_access_token, encrypted_refresh_token,
             token_expires_at_sec, expires_at_sec, created_at_sec, last_verified_at_sec
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          testId,
          "12345",
          validRole,
          "tier_1",
          "Ork Patron",
          500,
          "enc_acc",
          "enc_ref",
          1000,
          2000,
          100,
          100
        )
        .run();
      await db.prepare("DELETE FROM sessions WHERE id = ?").bind(testId).run();
    }
    console.log("  PASS: Valid session roles ('admin', 'comp', 'patron') accepted.");

    // Test invalid session role: should throw CHECK constraint error
    let sessionConstraintFailed = false;
    try {
      await db
        .prepare(
          `INSERT INTO sessions (
             id, patron_id, role, tier_id, tier_name, pledge_cents,
             encrypted_access_token, encrypted_refresh_token,
             token_expires_at_sec, expires_at_sec, created_at_sec, last_verified_at_sec
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          "invalid-role-session",
          "12345",
          "moderator", // Invalid role
          "tier_1",
          "Ork Patron",
          500,
          "enc_acc",
          "enc_ref",
          1000,
          2000,
          100,
          100
        )
        .run();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      sessionConstraintFailed = msg.includes("CHECK") || msg.includes("constraint");
    }
    assert(
      sessionConstraintFailed,
      "Inserting session with invalid role ('moderator') must be rejected by CHECK constraint"
    );
    console.log("  PASS: Invalid session role ('moderator') rejected by CHECK constraint.");

    // Test valid override role values: 'admin', 'comp'
    for (const validRole of ["admin", "comp"] as const) {
      const testPatronId = `patron-${validRole}-${Date.now()}`;
      await db
        .prepare(
          `INSERT INTO patron_overrides (patron_id, role, granted_by, created_at_sec, updated_at_sec)
           VALUES (?, ?, ?, ?, ?)`
        )
        .bind(testPatronId, validRole, "test_suite", 100, 100)
        .run();
      await db.prepare("DELETE FROM patron_overrides WHERE patron_id = ?").bind(testPatronId).run();
    }
    console.log("  PASS: Valid patron override roles ('admin', 'comp') accepted.");

    // Test invalid override role: 'patron' should fail on patron_overrides
    let overrideConstraintFailed = false;
    try {
      await db
        .prepare(
          `INSERT INTO patron_overrides (patron_id, role, granted_by, created_at_sec, updated_at_sec)
           VALUES (?, ?, ?, ?, ?)`
        )
        .bind("invalid-override-patron", "patron", "test_suite", 100, 100)
        .run();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      overrideConstraintFailed = msg.includes("CHECK") || msg.includes("constraint");
    }
    assert(
      overrideConstraintFailed,
      "Inserting patron_override with role 'patron' must be rejected by CHECK(role IN ('admin', 'comp'))"
    );
    console.log("  PASS: Invalid patron override role ('patron') rejected by CHECK constraint.");

    // ----------------------------------------------------
    // Step 7: Verify CRUD Functions in src/lib/db.ts
    // ----------------------------------------------------
    console.log("\nStep 7: Prepared statement CRUD operation verification (src/lib/db.ts).");

    const testSessionId = `test-sess-${Date.now()}`;
    const testPatronId = "99887766";

    // 7.1 upsertSession
    const sessionInput: SessionRecord = {
      id: testSessionId,
      patron_id: testPatronId,
      email: "test.patron@example.com",
      role: "patron",
      tier_id: "tier_elf",
      tier_name: "Elf Sybarite",
      pledge_cents: 1500,
      encrypted_access_token: "enc_access_token_blob",
      encrypted_refresh_token: "enc_refresh_token_blob",
      token_expires_at_sec: Math.floor(Date.now() / 1000) + 3600,
      expires_at_sec: Math.floor(Date.now() / 1000) + 86400,
      revoked: 0,
      created_at_sec: 1700000000,
      last_verified_at_sec: 1700000000,
    };

    await upsertSession(db, sessionInput);
    console.log("  PASS: upsertSession (insert) completed.");

    // 7.2 getSessionById
    const fetchedSession = await getSessionById(db, testSessionId);
    assert(fetchedSession !== null, "getSessionById must return newly inserted session");
    assert(fetchedSession.id === testSessionId, "Session ID must match");
    assert(fetchedSession.role === "patron", "Role must be 'patron'");
    assert(fetchedSession.tier_name === "Elf Sybarite", "Tier name must match");
    assert(fetchedSession.pledge_cents === 1500, "Pledge cents must match");
    assert(fetchedSession.revoked === 0, "Revoked flag must initially be 0");
    console.log("  PASS: getSessionById returned matching record.");

    // 7.3 upsertSession (update on conflict)
    const updatedInput: SessionRecord = {
      ...sessionInput,
      created_at_sec: 9999999999, // Distinct timestamp: must NOT overwrite original 1700000000
      tier_name: "Mind Fucker Avatar",
      pledge_cents: 5000,
      last_verified_at_sec: 1700001000,
    };
    await upsertSession(db, updatedInput);
    const updatedSession = await getSessionById(db, testSessionId);
    assert(updatedSession?.tier_name === "Mind Fucker Avatar", "Tier name must update on conflict");
    assert(updatedSession?.pledge_cents === 5000, "Pledge cents must update on conflict");
    assert(
      updatedSession?.created_at_sec === 1700000000,
      "created_at_sec must be preserved on conflict update"
    );
    console.log("  PASS: upsertSession conflict resolution updated record while preserving created_at_sec.");

    // 7.3b Test upsertSession with minimal optional fields (defaults check)
    const minimalSessionId = `min-sess-${Date.now()}`;
    await upsertSession(db, {
      id: minimalSessionId,
      patron_id: testPatronId,
      tier_id: "tier_ork",
      tier_name: "Ork Patron",
      pledge_cents: 500,
      encrypted_access_token: "min_access",
      encrypted_refresh_token: "min_refresh",
      token_expires_at_sec: Math.floor(Date.now() / 1000) + 3600,
      expires_at_sec: Math.floor(Date.now() / 1000) + 86400,
    });
    const minimalSession = await getSessionById(db, minimalSessionId);
    assert(minimalSession !== null, "Minimal session must be persisted");
    assert(minimalSession.role === "patron", "Omitted role must default to 'patron'");
    assert(minimalSession.revoked === 0, "Omitted revoked must default to 0");
    assert(minimalSession.email === null, "Omitted email must default to null");
    console.log("  PASS: upsertSession optional fields defaulted (role='patron', revoked=0, email=null).");

    // 7.3c Test getSessionsByPatronId & revokeSessionsByPatronId
    const patronSessions = await getSessionsByPatronId(db, testPatronId);
    assert(patronSessions.length >= 2, "getSessionsByPatronId must return all sessions for patron");
    await revokeSessionsByPatronId(db, testPatronId);
    const postRevokeSessions = await getSessionsByPatronId(db, testPatronId);
    assert(postRevokeSessions.every((s) => s.revoked === 1), "revokeSessionsByPatronId must mark all sessions revoked");
    console.log("  PASS: getSessionsByPatronId and revokeSessionsByPatronId completed.");
    await deleteSession(db, minimalSessionId);

    // 7.4 revokeSession
    await revokeSession(db, testSessionId);
    const revokedSession = await getSessionById(db, testSessionId);
    assert(revokedSession?.revoked === 1, "revokeSession must set revoked = 1");
    console.log("  PASS: revokeSession marked session as revoked (1).");

    // 7.5 deleteSession
    await deleteSession(db, testSessionId);
    const deletedSession = await getSessionById(db, testSessionId);
    assert(deletedSession === null, "deleteSession must remove the session from D1");
    console.log("  PASS: deleteSession removed record; getSessionById returned null.");

    // 7.6 upsertPatronOverride (insert)
    const overridePatronId = `override-${Date.now()}`;
    await upsertPatronOverride(
      db,
      {
        patron_id: overridePatronId,
        role: "admin",
        notes: "Initial studio staff bootstrap",
        granted_by: "system_bootstrap",
        created_at_sec: 1700000000,
        updated_at_sec: 1700000000,
      },
      SYSTEM_BOOTSTRAP_ACTOR
    );
    console.log("  PASS: upsertPatronOverride (insert) completed.");

    // 7.7 getPatronOverride
    const fetchedOverride = await getPatronOverride(db, overridePatronId);
    assert(fetchedOverride !== null, "getPatronOverride must return newly created override");
    assert(fetchedOverride.role === "admin", "Role must be 'admin'");
    assert(fetchedOverride.granted_by === "system_bootstrap", "granted_by must match");
    assert(fetchedOverride.notes === "Initial studio staff bootstrap", "Notes must match");
    console.log("  PASS: getPatronOverride returned matching record.");

    // 7.8 upsertPatronOverride (update on conflict)
    await upsertPatronOverride(
      db,
      {
        patron_id: overridePatronId,
        role: "comp",
        notes: "Updated to complimentary tester pass",
        granted_by: "lead_dev",
        created_at_sec: 9999999999, // Should NOT overwrite created_at_sec due to excluded.updated_at_sec
        updated_at_sec: 1700002000,
      },
      grantingAdminId
    );
    const updatedOverride = await getPatronOverride(db, overridePatronId);
    assert(updatedOverride?.role === "comp", "Role must be updated to 'comp'");
    assert(
      updatedOverride?.notes === "Updated to complimentary tester pass",
      "Notes must be updated"
    );
    assert(
      updatedOverride?.created_at_sec === 1700000000,
      "created_at_sec must be preserved on conflict update"
    );
    console.log("  PASS: upsertPatronOverride conflict update preserved created_at_sec.");

    // 7.9 listPatronOverrides
    const allOverrides = await listPatronOverrides(db);
    assert(
      allOverrides.some((o) => o.patron_id === overridePatronId),
      "listPatronOverrides must include our test override"
    );
    console.log(`  PASS: listPatronOverrides returned ${allOverrides.length} record(s) including test override.`);

    // 7.10 deletePatronOverrideGuarded (plain delete; sealing lives at action layer)
    await deletePatronOverrideGuarded(db, overridePatronId, grantingAdminId);
    const deletedOverride = await getPatronOverride(db, overridePatronId);
    assert(deletedOverride === null, "deletePatronOverrideGuarded must remove the override");
    console.log("  PASS: deletePatronOverrideGuarded removed record; getPatronOverride returned null.");

    // 7.11 countAdminOverrides & deletePatronOverrideGuarded
    // Founder-preservation (Amendment A-2026-09-19-01): the DB delete carries no
    // sole-admin block; founder access is env-guaranteed. A lone admin row is
    // still deletable; only sealing (action layer) protects founder rows.
    await db.prepare("DELETE FROM patron_overrides WHERE role = ?").bind("admin").run();
    assert(
      (await countAdminOverrides(db)) === 0,
      "Step 7.11 requires a clean admin set; admin overrides remained after clear"
    );
    const soleAdminId = `sole-admin-${Date.now()}`;
    const compId = `comp-${Date.now()}`;
    await upsertPatronOverride(
      db,
      {
        patron_id: soleAdminId,
        role: "admin",
        granted_by: grantingAdminId,
        created_at_sec: 1700000000,
        updated_at_sec: 1700000000,
      },
      grantingAdminId
    );
    assert((await countAdminOverrides(db)) >= 1, "countAdminOverrides must count admin overrides");

    // The last admin override is deletable (founder access is env-guaranteed).
    const soleChanges = await deletePatronOverrideGuarded(db, soleAdminId, grantingAdminId);
    assert(soleChanges === 1, "deletePatronOverrideGuarded must delete the last admin override");
    assert(
      (await getPatronOverride(db, soleAdminId)) === null,
      "Deleted sole admin override must be absent"
    );

    await upsertPatronOverride(
      db,
      {
        patron_id: soleAdminId,
        role: "admin",
        granted_by: grantingAdminId,
        created_at_sec: 1700000000,
        updated_at_sec: 1700000000,
      },
      grantingAdminId
    );

    // A comp override is always deletable.
    await upsertPatronOverride(
      db,
      {
        patron_id: compId,
        role: "comp",
        granted_by: grantingAdminId,
        created_at_sec: 1700000000,
        updated_at_sec: 1700000000,
      },
      grantingAdminId
    );
    const compChanges = await deletePatronOverrideGuarded(db, compId, grantingAdminId);
    assert(compChanges === 1, "deletePatronOverrideGuarded must always delete a comp override");
    assert((await getPatronOverride(db, compId)) === null, "Deleted comp override must be absent");

    await deletePatronOverrideGuarded(db, soleAdminId, grantingAdminId);
    console.log("  PASS: countAdminOverrides and deletePatronOverrideGuarded enforce founder-preservation (no sole-admin DB block).");

    // ----------------------------------------------------
    // Step 8: Parameterized Query Sanitization (AD-8)
    // ----------------------------------------------------
    console.log("\nStep 8: Parameterized query sanitization verification.");
    // Seed a real session first to ensure the table is NOT empty
    const canarySessionId = `canary-sess-${Date.now()}`;
    await upsertSession(db, {
      id: canarySessionId,
      patron_id: "canary_patron",
      tier_id: "tier_canary",
      tier_name: "Canary Backer",
      pledge_cents: 500,
      encrypted_access_token: "canary_acc",
      encrypted_refresh_token: "canary_ref",
      token_expires_at_sec: Math.floor(Date.now() / 1000) + 3600,
      expires_at_sec: Math.floor(Date.now() / 1000) + 86400,
    });

    const sqlInjectionPayload = "' OR '1'='1";
    const sqliResult = await getSessionById(db, sqlInjectionPayload);
    assert(
      sqliResult === null,
      "Parameterized query must sanitize input and return null instead of leaking existing rows"
    );
    await deleteSession(db, canarySessionId);
    console.log("  PASS: Parameterized prepared statement resisted SQL injection payload on populated table.");

    // ----------------------------------------------------
    // Step 9: Verify `override_audit` Schema (read-only)
    // ----------------------------------------------------
    // The trail is append-only by trigger, so this step performs no writes at all: a row created
    // here would live in the shared local database forever.
    console.log("\nStep 9: 'override_audit' schema verification (read-only).");
    const { results: auditCols } = await db
      .prepare("PRAGMA table_info(override_audit)")
      .all<ColumnInfo>();

    const auditColMap = new Map(auditCols.map((c) => [c.name, c]));

    const expectedAuditCols: Record<string, { type: string; notnull: number; pk: number }> = {
      id: { type: "INTEGER", notnull: 0, pk: 1 },
      actor_patron_id: { type: "TEXT", notnull: 1, pk: 0 },
      target_patron_id: { type: "TEXT", notnull: 1, pk: 0 },
      action: { type: "TEXT", notnull: 1, pk: 0 },
      before_role: { type: "TEXT", notnull: 0, pk: 0 },
      after_role: { type: "TEXT", notnull: 0, pk: 0 },
      created_at_sec: { type: "INTEGER", notnull: 1, pk: 0 },
    };

    for (const [colName, expected] of Object.entries(expectedAuditCols)) {
      const col = auditColMap.get(colName);
      assert(col, `Column '${colName}' must exist in table 'override_audit'`);
      assert(
        col.type.toUpperCase() === expected.type,
        `Column '${colName}' expected type '${expected.type}', got '${col.type}'`
      );
      if (expected.notnull) {
        assert(col.notnull === 1, `Column '${colName}' must be NOT NULL`);
      }
      if (expected.pk) {
        assert(col.pk === 1, `Column '${colName}' must be PRIMARY KEY`);
      }
    }
    console.log("  PASS: All 7 'override_audit' columns verified with correct types and constraints.");

    const { results: auditIndexes } = await db
      .prepare("PRAGMA index_list(override_audit)")
      .all<IndexInfo>();
    const auditIndexNames = new Set(auditIndexes.map((idx) => idx.name));
    const requiredAuditIndexes = ["idx_override_audit_created_at", "idx_override_audit_target"];

    for (const idx of requiredAuditIndexes) {
      assert(auditIndexNames.has(idx), `Index '${idx}' must exist on table 'override_audit'`);
    }
    console.log(`  PASS: Required 'override_audit' indexes verified: ${requiredAuditIndexes.join(", ")}`);

    const { results: auditTriggers } = await db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'override_audit'")
      .all<{ name: string }>();
    const auditTriggerNames = new Set(auditTriggers.map((t) => t.name));
    const requiredAuditTriggers = ["trg_override_audit_no_update", "trg_override_audit_no_delete"];

    for (const trg of requiredAuditTriggers) {
      assert(auditTriggerNames.has(trg), `Trigger '${trg}' must exist on table 'override_audit'`);
    }
    console.log(`  PASS: Append-only triggers verified: ${requiredAuditTriggers.join(", ")}`);

    // ----------------------------------------------------
    // Step 10: Verify `override_audit` Behaviour (isolated database)
    // ----------------------------------------------------
    console.log("\nStep 10: 'override_audit' behaviour verification (isolated throwaway database).");
    await verifyAuditBehaviour(db);

    console.log("\n==================================================");
    console.log("All schema and query verification checks passed.");
    console.log("==================================================");
  } finally {
    await proxy.dispose();
  }
}

runVerification().catch((err) => {
  console.error("\nVerification failed:", err);
  process.exit(1);
});
