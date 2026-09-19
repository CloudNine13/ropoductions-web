/**
 * Comprehensive Automated Verification for Cloudflare D1 Database Schema
 * Validates:
 * 1. Table schemas for `sessions` and `patron_overrides`
 * 2. Column names, types, constraints, and defaults
 * 3. Required indexes presence and configuration
 * 4. SQLite CHECK constraints (`role IN ('admin', 'comp', 'patron')`, `role IN ('admin', 'comp')`)
 * 5. Parameterized prepared statements CRUD functions in `src/lib/db.ts`
 * 6. SQL injection resistance via prepared parameter binding
 */

import { getPlatformProxy } from "wrangler";
import {
  countAdminOverrides,
  deletePatronOverride,
  deletePatronOverrideGuarded,
  deleteSession,
  getPatronOverride,
  getSessionById,
  getSessionsByPatronId,
  listPatronOverrides,
  revokeSession,
  revokeSessionsByPatronId,
  upsertPatronOverride,
  upsertSession,
} from "../src/lib/db";
import type { SessionRecord } from "../src/types/database";

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
    console.log("  PASS: Tables 'sessions' and 'patron_overrides' confirmed present.");

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
    await upsertPatronOverride(db, {
      patron_id: overridePatronId,
      role: "admin",
      notes: "Initial studio staff bootstrap",
      granted_by: "system_bootstrap",
      created_at_sec: 1700000000,
      updated_at_sec: 1700000000,
    });
    console.log("  PASS: upsertPatronOverride (insert) completed.");

    // 7.7 getPatronOverride
    const fetchedOverride = await getPatronOverride(db, overridePatronId);
    assert(fetchedOverride !== null, "getPatronOverride must return newly created override");
    assert(fetchedOverride.role === "admin", "Role must be 'admin'");
    assert(fetchedOverride.granted_by === "system_bootstrap", "granted_by must match");
    assert(fetchedOverride.notes === "Initial studio staff bootstrap", "Notes must match");
    console.log("  PASS: getPatronOverride returned matching record.");

    // 7.8 upsertPatronOverride (update on conflict)
    await upsertPatronOverride(db, {
      patron_id: overridePatronId,
      role: "comp",
      notes: "Updated to complimentary tester pass",
      granted_by: "lead_dev",
      created_at_sec: 9999999999, // Should NOT overwrite created_at_sec due to excluded.updated_at_sec
      updated_at_sec: 1700002000,
    });
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

    // 7.10 deletePatronOverride
    await deletePatronOverride(db, overridePatronId);
    const deletedOverride = await getPatronOverride(db, overridePatronId);
    assert(deletedOverride === null, "deletePatronOverride must remove the override");
    console.log("  PASS: deletePatronOverride removed record; getPatronOverride returned null.");

    // 7.11 countAdminOverrides & deletePatronOverrideGuarded (Story 5.3 sole-admin invariant)
    const soleAdminId = `sole-admin-${Date.now()}`;
    const coAdminId = `co-admin-${Date.now()}`;
    const compId = `comp-${Date.now()}`;
    const grantingAdminId = "11111111";
    await upsertPatronOverride(db, {
      patron_id: soleAdminId,
      role: "admin",
      granted_by: grantingAdminId,
      created_at_sec: 1700000000,
      updated_at_sec: 1700000000,
    });
    assert((await countAdminOverrides(db)) >= 1, "countAdminOverrides must count admin overrides");

    // Sole admin deletion must be blocked (0 changes) and leave the row intact.
    const blockedChanges = await deletePatronOverrideGuarded(db, soleAdminId);
    assert(blockedChanges === 0, "deletePatronOverrideGuarded must block deleting the sole admin");
    assert(
      (await getPatronOverride(db, soleAdminId)) !== null,
      "Sole admin override must remain after blocked deletion"
    );

    // A comp override is always deletable, even when no other admin exists.
    await upsertPatronOverride(db, {
      patron_id: compId,
      role: "comp",
      granted_by: grantingAdminId,
      created_at_sec: 1700000000,
      updated_at_sec: 1700000000,
    });
    const compChanges = await deletePatronOverrideGuarded(db, compId);
    assert(compChanges === 1, "deletePatronOverrideGuarded must always delete a comp override");
    assert((await getPatronOverride(db, compId)) === null, "Deleted comp override must be absent");

    // With a second admin present, the guarded delete must succeed.
    await upsertPatronOverride(db, {
      patron_id: coAdminId,
      role: "admin",
      granted_by: grantingAdminId,
      created_at_sec: 1700000000,
      updated_at_sec: 1700000000,
    });
    const allowedChanges = await deletePatronOverrideGuarded(db, soleAdminId);
    assert(allowedChanges === 1, "deletePatronOverrideGuarded must delete when another admin remains");
    assert((await getPatronOverride(db, soleAdminId)) === null, "Deleted override must be absent");
    await deletePatronOverride(db, coAdminId);
    console.log("  PASS: countAdminOverrides and deletePatronOverrideGuarded enforce the sole-admin invariant.");

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
