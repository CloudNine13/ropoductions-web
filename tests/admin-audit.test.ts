import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { PatronOverrideRecord, SessionRecord } from "../src/types/database";
import { handleRevokeOverrideCore, handleUpsertOverrideCore } from "../src/app/(admin)/admin/overrides/actions";
import { createMockD1, type MockD1State } from "./helpers/mock-d1";

const worktreeDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (rel: string): string => readFileSync(join(worktreeDir, rel), "utf8");

const CALLER_ID = "12345678";
const CALLER_B_ID = "87654321";
const TARGET_ID = "22222222";

function adminSessionFixture(patronId: string): SessionRecord {
  return {
    id: `session-${patronId}`,
    patron_id: patronId,
    email: "admin@example.com",
    role: "admin",
    tier_id: "override_admin",
    tier_name: "Studio Admin",
    pledge_cents: 0,
    encrypted_access_token: "enc",
    encrypted_refresh_token: "ref",
    token_expires_at_sec: 2000000000,
    expires_at_sec: 2000000000,
    revoked: 0,
    created_at_sec: 1700000000,
    last_verified_at_sec: 1700000000,
  };
}

function overrideFixture(
  patronId: string,
  role: "admin" | "comp",
  grantedBy: string = "99999999"
): PatronOverrideRecord {
  return {
    patron_id: patronId,
    role,
    notes: null,
    granted_by: grantedBy,
    created_at_sec: 1700000000,
    updated_at_sec: 1700000000,
  };
}

/** Seeds an acting administrator: an admin session plus the matching admin override row. */
function seedCaller(mock: MockD1State, patronId: string): SessionRecord {
  mock.overrides.set(patronId, overrideFixture(patronId, "admin"));
  return adminSessionFixture(patronId);
}

/** Swaps in a `batch` that fails before any statement runs, emulating a rolled-back transaction. */
function dbWithFailingBatch(mock: MockD1State): D1Database {
  return {
    ...mock.db,
    async batch() {
      throw new Error("D1 batch rejected");
    },
  } as unknown as D1Database;
}

describe("override audit trail (append-only attribution)", () => {
  it("appends one attributed audit row when a grant is written", async () => {
    const mock = createMockD1();
    const callingSession = seedCaller(mock, CALLER_ID);

    const result = await handleUpsertOverrideCore({
      db: mock.db,
      callingSession,
      patronId: TARGET_ID,
      role: "comp",
      nowSec: 1700000000,
    });

    assert.equal(result.success, true);
    assert.equal(mock.overrides.get(TARGET_ID)?.role, "comp");
    assert.equal(mock.audit.length, 1);
    assert.equal(mock.audit[0].actor_patron_id, CALLER_ID);
    assert.equal(mock.audit[0].target_patron_id, TARGET_ID);
    assert.equal(mock.audit[0].after_role, "comp");
    assert.ok(mock.audit[0].created_at_sec > 0);
  });

  it("appends a new row for a repeated upsert and leaves the earlier row untouched", async () => {
    const mock = createMockD1();
    const callingSession = seedCaller(mock, CALLER_ID);

    await handleUpsertOverrideCore({
      db: mock.db,
      callingSession,
      patronId: TARGET_ID,
      role: "comp",
      nowSec: 1700000000,
    });
    const firstRow = { ...mock.audit[0] };

    const second = await handleUpsertOverrideCore({
      db: mock.db,
      callingSession,
      patronId: TARGET_ID,
      role: "admin",
      nowSec: 1700000100,
    });

    assert.equal(second.success, true);
    assert.equal(mock.audit.length, 2);
    assert.deepEqual(mock.audit[0], firstRow);
    assert.equal(mock.audit[1].actor_patron_id, CALLER_ID);
    assert.equal(mock.audit[1].target_patron_id, TARGET_ID);
    assert.equal(mock.audit[1].after_role, "admin");
    assert.equal(mock.overrides.get(TARGET_ID)?.role, "admin");
  });

  it("appends one audit row and removes the override on revocation", async () => {
    const mock = createMockD1();
    const callingSession = seedCaller(mock, CALLER_ID);
    mock.overrides.set(TARGET_ID, overrideFixture(TARGET_ID, "comp"));

    const result = await handleRevokeOverrideCore({
      db: mock.db,
      callingSession,
      patronId: TARGET_ID,
    });

    assert.equal(result.success, true);
    assert.match(result.message ?? "", /revoked comp pass/i);
    assert.equal(mock.audit.length, 1);
    assert.equal(mock.audit[0].actor_patron_id, CALLER_ID);
    assert.equal(mock.audit[0].target_patron_id, TARGET_ID);
    assert.ok(mock.audit[0].created_at_sec > 0);
    assert.equal(mock.overrides.has(TARGET_ID), false);
  });

  it("appends nothing when revoking an absent target", async () => {
    const mock = createMockD1();
    const callingSession = seedCaller(mock, CALLER_ID);

    const result = await handleRevokeOverrideCore({
      db: mock.db,
      callingSession,
      patronId: TARGET_ID,
    });

    assert.equal(result.success, true);
    assert.match(result.message ?? "", /no override exists/i);
    assert.equal(mock.audit.length, 0);
    assert.equal(mock.overrides.has(CALLER_ID), true);
  });

  it("leaves trail and overrides untouched when the grant batch fails", async () => {
    const mock = createMockD1();
    const callingSession = seedCaller(mock, CALLER_ID);

    const result = await handleUpsertOverrideCore({
      db: dbWithFailingBatch(mock),
      callingSession,
      patronId: TARGET_ID,
      role: "comp",
    });

    assert.equal(result.success, false);
    assert.match(result.error ?? "", /database operation failed/i);
    assert.equal(mock.audit.length, 0);
    assert.equal(mock.overrides.has(TARGET_ID), false);
  });

  it("leaves trail and overrides untouched when the revoke batch fails", async () => {
    const mock = createMockD1();
    const callingSession = seedCaller(mock, CALLER_ID);
    mock.overrides.set(TARGET_ID, overrideFixture(TARGET_ID, "comp"));

    const result = await handleRevokeOverrideCore({
      db: dbWithFailingBatch(mock),
      callingSession,
      patronId: TARGET_ID,
    });

    assert.equal(result.success, false);
    assert.equal(result.code, "db_error");
    assert.equal(mock.audit.length, 0);
    assert.equal(mock.overrides.get(TARGET_ID)?.role, "comp");
  });

  it("attributes each row to the caller that produced it", async () => {
    const mock = createMockD1();
    const callerA = seedCaller(mock, CALLER_ID);
    const callerB = seedCaller(mock, CALLER_B_ID);

    await handleUpsertOverrideCore({
      db: mock.db,
      callingSession: callerA,
      patronId: TARGET_ID,
      role: "comp",
      nowSec: 1700000000,
    });
    await handleUpsertOverrideCore({
      db: mock.db,
      callingSession: callerB,
      patronId: "33333333",
      role: "comp",
      nowSec: 1700000000,
    });

    assert.equal(mock.audit.length, 2);
    assert.equal(
      mock.audit.find((row) => row.target_patron_id === TARGET_ID)?.actor_patron_id,
      CALLER_ID
    );
    assert.equal(
      mock.audit.find((row) => row.target_patron_id === "33333333")?.actor_patron_id,
      CALLER_B_ID
    );
  });
});

describe("audit trail authorization guards", () => {
  it("keeps the trail out of the authorization modules", () => {
    for (const rel of ["src/lib/auth.ts", "src/lib/admin.ts"]) {
      const src = readSource(rel);
      // The trail is display-only: authorization must never consult it.
      assert.ok(!src.includes("override_audit"), `${rel} must not reference override_audit`);
      assert.ok(!src.includes("listOverrideAudit"), `${rel} must not read the audit trail`);
      assert.ok(!src.includes("OverrideAuditRecord"), `${rel} must not import audit types`);
    }
  });
});

const OVERRIDE_DML_PATTERN =
  /(INSERT INTO patron_overrides|UPDATE patron_overrides|DELETE FROM patron_overrides)/;

/**
 * Accepted exemptions for direct `patron_overrides` DML.
 * `src/lib/db.ts` is the sole production write path (both writes are batched with their
 * audit row there); `scripts/e2e/setup-e2e-env.ts` owns the disposable E2E founder fixture.
 * Any other writer would bypass the audit trail, so it must fail this guard.
 */
const OVERRIDE_DML_ALLOWLIST = new Set([
  "src/lib/db.ts",
  "scripts/e2e/setup-e2e-env.ts",
]);

function collectSourceFiles(root: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const abs = join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "migrations" || entry.name === "__tests__") {
        continue;
      }
      collectSourceFiles(abs, acc);
      continue;
    }
    if (/\.test\.tsx?$/.test(entry.name) || /\.spec\.tsx?$/.test(entry.name)) {
      continue;
    }
    acc.push(abs);
  }
  return acc;
}

describe("patron_overrides DML allowlist", () => {
  it("routes every override mutation through the audited DAL or the E2E fixture seeder", () => {
    const files = ["src", "scripts", ".github"].flatMap((root) =>
      collectSourceFiles(join(worktreeDir, root))
    );
    const relativePaths = files.map((abs) => relative(worktreeDir, abs).split(sep).join("/"));

    // Fail loudly if the walk stopped reaching real sources: an empty scan would
    // otherwise report "no violations" for a guard that never looked at anything.
    assert.ok(
      relativePaths.includes("src/lib/db.ts"),
      "source walk must reach the DAL"
    );
    assert.match(readSource("src/lib/db.ts"), OVERRIDE_DML_PATTERN);

    const violations = relativePaths.filter(
      (rel) =>
        !OVERRIDE_DML_ALLOWLIST.has(rel) &&
        OVERRIDE_DML_PATTERN.test(readFileSync(join(worktreeDir, rel), "utf8"))
    );

    assert.deepEqual(violations, []);
  });
});
