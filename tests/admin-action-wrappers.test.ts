import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { signValue } from "../src/lib/crypto";
import { SESSION_COOKIE_NAME, AGE_VERIFIED_COOKIE_NAME } from "../src/lib/cookies";
import { setMockCookies } from "./helpers/next-headers-shim.mjs";
import { createMockD1, type MockD1Database, type MockD1State } from "./helpers/mock-d1";
import {
  upsertOverrideAction,
  revokeOverrideAction,
  type OverrideActionState,
} from "../src/app/(admin)/admin/overrides/actions";

const TEST_SECRET = "0123456789abcdef0123456789abcdef";
const CALLER_ID = "12345678";

function makeForm(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) {
    fd.set(k, v);
  }
  return fd;
}

async function seedAdminSession(db: MockD1Database) {
  const now = Math.floor(Date.now() / 1000);
  db._sessions.set("admin-session", {
    id: "admin-session",
    patron_id: CALLER_ID,
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
    created_at_sec: now,
    last_verified_at_sec: now,
  });
  db._overrides.set(CALLER_ID, {
    patron_id: CALLER_ID,
    role: "admin",
    notes: null,
    granted_by: "other-admin-1",
    created_at_sec: now,
    updated_at_sec: now,
  });
  const cookie = await signValue("admin-session", TEST_SECRET);
  setMockCookies({
    [SESSION_COOKIE_NAME]: cookie,
    [AGE_VERIFIED_COOKIE_NAME]: "true",
  });
}

describe("exported admin server-action wrappers (real FormData)", () => {
  const originalSecret = process.env.SESSION_SECRET;
  const originalCreators = process.env.CREATOR_ADMIN_PATREON_IDS;
  let previousD1: D1Database | undefined;
  let mock: MockD1State;

  beforeEach(() => {
    mock = createMockD1();
    previousD1 = globalThis.__D1_TEST_DB__;
    globalThis.__D1_TEST_DB__ = mock.db;
    process.env.SESSION_SECRET = TEST_SECRET;
    process.env.CREATOR_ADMIN_PATREON_IDS = "99999";
  });

  afterEach(() => {
    globalThis.__D1_TEST_DB__ = previousD1;
    if (originalSecret) {
      process.env.SESSION_SECRET = originalSecret;
    } else {
      delete process.env.SESSION_SECRET;
    }
    if (originalCreators) {
      process.env.CREATOR_ADMIN_PATREON_IDS = originalCreators;
    } else {
      delete process.env.CREATOR_ADMIN_PATREON_IDS;
    }
    setMockCookies({});
  });

  it("upsertOverrideAction grants a new comp pass via FormData", async () => {
    await seedAdminSession(mock.db);
    const state: OverrideActionState | undefined = undefined;
    const result = await upsertOverrideAction(state, makeForm({
      patron_id: "33333333",
      role: "comp",
      notes: "New playtester",
    }));

    assert.equal(result.success, true);
    assert.equal(mock.overrides.get("33333333")?.role, "comp");
    assert.equal(mock.overrides.get("33333333")?.granted_by, CALLER_ID);
  });

  it("upsertOverrideAction rejects a sealed Creator Admin via FormData", async () => {
    await seedAdminSession(mock.db);
    const result = await upsertOverrideAction(undefined, makeForm({
      patron_id: "99999",
      role: "comp",
      notes: "attempt",
    }));
    assert.equal(result.success, false);
    assert.match(result.error ?? "", /creator admin.*sealed/i);
  });

  it("upsertOverrideAction rejects an invalid patron ID via FormData", async () => {
    await seedAdminSession(mock.db);
    const result = await upsertOverrideAction(undefined, makeForm({
      patron_id: "012345",
      role: "comp",
      notes: null as unknown as string,
    }));
    assert.equal(result.success, false);
    assert.match(result.error ?? "", /patreon id/i);
  });

  it("upsertOverrideAction fails closed under db_error on write failure", async () => {
    await seedAdminSession(mock.db);
    const failingDb = {
      ...mock.db,
      prepare(sql: string) {
        if (sql.includes("INSERT INTO patron_overrides")) {
          throw new Error("D1 write timeout");
        }
        return mock.db.prepare(sql);
      },
    } as unknown as D1Database;
    globalThis.__D1_TEST_DB__ = failingDb;

    const result = await upsertOverrideAction(undefined, makeForm({
      patron_id: "33333333",
      role: "comp",
      notes: "fail",
    }));
    assert.equal(result.success, false);
    assert.match(result.error ?? "", /database operation failed/i);
  });

  it("revokeOverrideAction revokes a comp pass via FormData", async () => {
    await seedAdminSession(mock.db);
    mock.overrides.set("22222222", {
      patron_id: "22222222",
      role: "comp",
      notes: "playtester",
      granted_by: CALLER_ID,
      created_at_sec: 1700000000,
      updated_at_sec: 1700000000,
    });
    const result = await revokeOverrideAction(undefined, makeForm({ patron_id: "22222222" }));
    assert.equal(result.success, true);
    assert.equal(mock.overrides.has("22222222"), false);
  });

  it("revokeOverrideAction rejects a sealed creator via FormData", async () => {
    await seedAdminSession(mock.db);
    const result = await revokeOverrideAction(undefined, makeForm({ patron_id: "99999" }));
    assert.equal(result.success, false);
    assert.equal(result.code, "sealed_creator_admin");
  });

  it("revokeOverrideAction allows self-revocation of the last added admin", async () => {
    await seedAdminSession(mock.db);
    // Caller is the only admin — self-revoke must succeed (founder-preservation).
    const result = await revokeOverrideAction(undefined, makeForm({ patron_id: CALLER_ID }));
    assert.equal(result.success, true);
    assert.equal(mock.overrides.has(CALLER_ID), false);
  });
});