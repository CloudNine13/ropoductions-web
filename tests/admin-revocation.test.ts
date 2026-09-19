import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { PatronOverrideRecord, SessionRecord } from "../src/types/database";
import { countAdminOverrides, deletePatronOverrideGuarded } from "../src/lib/db";
import { handleRevokeOverrideCore } from "../src/app/(admin)/admin/overrides/actions";
import { createMockD1 } from "./helpers/mock-d1";

const worktreeDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (rel: string): string => readFileSync(join(worktreeDir, rel), "utf8");

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
  grantedBy: string = "12345678"
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

describe("countAdminOverrides", () => {
  it("counts only admin overrides", async () => {
    const { db, overrides } = createMockD1();
    overrides.set("11111111", overrideFixture("11111111", "admin"));
    overrides.set("22222222", overrideFixture("22222222", "comp"));
    overrides.set("33333333", overrideFixture("33333333", "admin", "system_bootstrap"));
    assert.equal(await countAdminOverrides(db), 2);
  });

  it("returns zero when no admin overrides exist", async () => {
    const { db } = createMockD1();
    assert.equal(await countAdminOverrides(db), 0);
  });
});

describe("deletePatronOverrideGuarded (founder-preservation invariant)", () => {
  it("always deletes a comp override", async () => {
    const { db, overrides } = createMockD1();
    overrides.set("22222222", overrideFixture("22222222", "comp"));
    const changes = await deletePatronOverrideGuarded(db, "22222222");
    assert.equal(changes, 1);
    assert.equal(overrides.has("22222222"), false);
  });

  it("deletes an admin override when another admin remains", async () => {
    const { db, overrides } = createMockD1();
    overrides.set("11111111", overrideFixture("11111111", "admin"));
    overrides.set("33333333", overrideFixture("33333333", "admin"));
    const changes = await deletePatronOverrideGuarded(db, "33333333");
    assert.equal(changes, 1);
    assert.equal(overrides.has("33333333"), false);
    assert.equal(overrides.has("11111111"), true);
  });

  it("deletes the last admin override (founder access is env-guaranteed)", async () => {
    const { db, overrides } = createMockD1();
    overrides.set("11111111", overrideFixture("11111111", "admin"));
    const changes = await deletePatronOverrideGuarded(db, "11111111");
    assert.equal(changes, 1);
    assert.equal(overrides.has("11111111"), false);
  });

  it("reports zero changes for an absent override", async () => {
    const { db } = createMockD1();
    assert.equal(await deletePatronOverrideGuarded(db, "99999999"), 0);
  });
});

describe("override revocation core logic (handleRevokeOverrideCore)", () => {
  it("rejects a non-admin calling session", async () => {
    const { db } = createMockD1();
    const caller = { ...adminSessionFixture("12345678"), role: "patron" as const };
    const result = await handleRevokeOverrideCore({
      db,
      callingSession: caller,
      patronId: "22222222",
    });
    assert.equal(result.success, false);
    assert.equal(result.code, "unauthorized");
  });

  it("rejects an invalid Patreon ID", async () => {
    const { db, overrides } = createMockD1();
    overrides.set("12345678", overrideFixture("12345678", "admin"));
    const result = await handleRevokeOverrideCore({
      db,
      callingSession: adminSessionFixture("12345678"),
      patronId: "not-a-number",
    });
    assert.equal(result.success, false);
    assert.equal(result.code, "invalid_patron_id");
  });

  it("rejects revocation of a Creator Admin identified by env config", async () => {
    const { db, overrides } = createMockD1();
    overrides.set("12345678", overrideFixture("12345678", "admin"));
    const result = await handleRevokeOverrideCore({
      db,
      callingSession: adminSessionFixture("12345678"),
      patronId: "99999999",
      creatorAdminIds: "99999999,11111111",
    });
    assert.equal(result.success, false);
    assert.equal(result.code, "sealed_creator_admin");
    assert.equal(overrides.has("99999999"), false);
  });

  it("rejects revocation of a sealed override with granted_by = 'system_bootstrap'", async () => {
    const { db, overrides } = createMockD1();
    overrides.set("12345678", overrideFixture("12345678", "admin"));
    overrides.set("77777777", overrideFixture("77777777", "admin", "system_bootstrap"));
    const result = await handleRevokeOverrideCore({
      db,
      callingSession: adminSessionFixture("12345678"),
      patronId: "77777777",
    });
    assert.equal(result.success, false);
    assert.equal(result.code, "sealed_creator_admin");
    assert.equal(overrides.has("77777777"), true);
  });

  it("rejects a caller whose own admin override no longer exists", async () => {
    const { db } = createMockD1();
    const result = await handleRevokeOverrideCore({
      db,
      callingSession: adminSessionFixture("12345678"),
      patronId: "22222222",
    });
    assert.equal(result.success, false);
    assert.equal(result.code, "unauthorized");
  });

  it("returns idempotent success when the target override is already gone", async () => {
    const { db, overrides } = createMockD1();
    overrides.set("12345678", overrideFixture("12345678", "admin"));
    const result = await handleRevokeOverrideCore({
      db,
      callingSession: adminSessionFixture("12345678"),
      patronId: "44444444",
    });
    assert.equal(result.success, true);
    assert.match(result.message ?? "", /no override exists/i);
  });

  it("allows self-revocation of the last added admin (founder-preservation)", async () => {
    const { db, overrides } = createMockD1();
    overrides.set("12345678", overrideFixture("12345678", "admin"));
    const result = await handleRevokeOverrideCore({
      db,
      callingSession: adminSessionFixture("12345678"),
      patronId: "12345678",
    });
    assert.equal(result.success, true);
    assert.equal(overrides.has("12345678"), false);
  });

  it("revokes a panel admin when another admin remains", async () => {
    const { db, overrides } = createMockD1();
    overrides.set("12345678", overrideFixture("12345678", "admin"));
    overrides.set("55555555", overrideFixture("55555555", "admin"));

    const result = await handleRevokeOverrideCore({
      db,
      callingSession: adminSessionFixture("12345678"),
      patronId: "55555555",
    });

    assert.equal(result.success, true);
    assert.match(result.message ?? "", /revoked admin pass/i);
    assert.equal(overrides.has("55555555"), false);
    assert.equal(overrides.has("12345678"), true);
  });

  it("revokes a comp override", async () => {
    const { db, overrides } = createMockD1();
    overrides.set("12345678", overrideFixture("12345678", "admin"));
    overrides.set("22222222", overrideFixture("22222222", "comp"));
    const result = await handleRevokeOverrideCore({
      db,
      callingSession: adminSessionFixture("12345678"),
      patronId: "22222222",
    });
    assert.equal(result.success, true);
    assert.equal(overrides.has("22222222"), false);
  });

  it("fails closed when the guarded delete throws", async () => {
    const { db, overrides } = createMockD1();
    overrides.set("12345678", overrideFixture("12345678", "admin"));
    overrides.set("55555555", overrideFixture("55555555", "comp"));

    const failingDb = {
      ...db,
      prepare(sql: string) {
        if (sql.includes("DELETE FROM patron_overrides")) {
          throw new Error("D1 write timeout");
        }
        return db.prepare(sql);
      },
    } as unknown as D1Database;

    const result = await handleRevokeOverrideCore({
      db: failingDb,
      callingSession: adminSessionFixture("12345678"),
      patronId: "55555555",
    });
    assert.equal(result.success, false);
    assert.equal(result.code, "db_error");
  });

  it("returns idempotent success when the target vanishes between the check and delete", async () => {
    const caller = "12345678";
    const target = "22222222";
    let targetReads = 0;

    const concurrentDb = {
      prepare(sql: string) {
        const isSelect = sql.includes("FROM patron_overrides WHERE patron_id = ?");
        const isDelete = sql.includes("DELETE FROM patron_overrides");
        let params: unknown[] = [];
        return {
          bind(...p: unknown[]) {
            params = p;
            return this;
          },
          async first<T>(): Promise<T | null> {
            if (!isSelect) return null;
            const patronId = params[0] as string;
            if (patronId === caller) return overrideFixture(caller, "admin") as unknown as T;
            targetReads += 1;
            return targetReads === 1 ? (overrideFixture(target, "comp") as unknown as T) : null;
          },
          async run() {
            return { success: true, meta: { changes: isDelete ? 0 : 0 } };
          },
        };
      },
    } as unknown as D1Database;

    const result = await handleRevokeOverrideCore({
      db: concurrentDb,
      callingSession: adminSessionFixture(caller),
      patronId: target,
    });

    assert.equal(result.success, true);
    assert.match(result.message ?? "", /no override exists/i);
  });
});

describe("revocation UI wiring and design tokens", () => {
  it("provisions RevokeOverrideButton with Radix Dialog, crimson confirm, and accessible names", () => {
    const src = readSource("src/components/admin/revoke-override-button.tsx");
    assert.match(src, /['"]use client['"]/);
    assert.match(src, /useTransition/);
    assert.match(src, /revokeOverrideAction/);
    assert.match(src, /@radix-ui\/react-dialog/);
    assert.match(src, /data-testid="override-revoke-trigger"/);
    assert.match(src, /data-testid="override-revoke-dialog"/);
    assert.match(src, /data-testid="override-revoke-confirm-button"/);
    assert.match(src, /data-testid="override-revoke-cancel-button"/);
    assert.match(src, /data-testid="override-revoke-error"/);
    assert.match(src, /role="alert"/);
    assert.match(src, /#E11D48/);
    assert.match(src, /min-h-\[44px\]/);
    assert.match(src, /aria-label=\{t\("ariaLabel", \{ role, patronId \}\)\}/);
  });

  it("wires the overrides table with revoke button, dropping the sole-admin block", () => {
    const src = readSource("src/components/admin/overrides-table.tsx");
    assert.match(src, /RevokeOverrideButton/);
    assert.ok(!src.includes("soleAdminSelf"));
    assert.ok(!src.includes("adminOverrideCount"));
    assert.ok(!src.includes("Cannot revoke the sole remaining administrator"));
  });

  it("wires the Server Action with guarded delete, session revocation, and revalidatePath", () => {
    const src = readSource("src/app/(admin)/admin/overrides/actions.ts");
    assert.match(src, /revokeOverrideAction/);
    assert.match(src, /handleRevokeOverrideCore/);
    assert.match(src, /deletePatronOverrideGuarded/);
    assert.match(src, /revalidatePath/);
    assert.ok(!src.includes("sole_admin"));
    assert.match(src, /sealed_creator_admin/);
  });
});