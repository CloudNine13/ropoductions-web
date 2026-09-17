import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseInitialAdminPatreonIds,
  bootstrapInitialAdminIfEligible,
  syncInitialAdminOverrides,
  isCreatorAdmin,
  assertCanModifyOverride,
} from "../src/lib/patreon";
import { validateSessionAccess } from "../src/lib/auth";
import { getAuthEnv } from "../src/lib/cloudflare";
import { signValue } from "../src/lib/crypto";
import type { SessionRecord, PatronOverrideRecord } from "../src/types/database";

function createMockD1() {
  const overrides = new Map<string, PatronOverrideRecord>();
  const sessions = new Map<string, SessionRecord>();

  const db = {
    prepare(sql: string) {
      const stmt = {
        params: [] as unknown[],
        bind(...params: unknown[]) {
          stmt.params = params;
          return stmt;
        },
        async first<T>(): Promise<T | null> {
          if (sql.includes("FROM patron_overrides WHERE patron_id = ?")) {
            const patronId = stmt.params[0] as string;
            return (overrides.get(patronId) as T | undefined) ?? null;
          }
          if (sql.includes("FROM sessions WHERE id = ?")) {
            const sessionId = stmt.params[0] as string;
            return (sessions.get(sessionId) as T | undefined) ?? null;
          }
          throw new Error(`Unhandled query in mock first(): ${sql}`);
        },
        async all<T>(): Promise<{ results: T[] }> {
          if (sql.includes("FROM patron_overrides")) {
            return { results: Array.from(overrides.values()) as unknown as T[] };
          }
          throw new Error(`Unhandled query in mock all(): ${sql}`);
        },
        async run(): Promise<{ success: boolean; meta: Record<string, unknown> }> {
          if (sql.includes("INSERT INTO patron_overrides")) {
            const [patronId, role, notes, grantedBy, createdAt, updatedAt] = stmt.params as [
              string,
              "admin" | "comp",
              string | null,
              string,
              number,
              number,
            ];
            const existing = overrides.get(patronId);
            overrides.set(patronId, {
              patron_id: patronId,
              role,
              notes: notes ?? existing?.notes ?? null,
              granted_by: grantedBy,
              created_at_sec: existing?.created_at_sec ?? createdAt,
              updated_at_sec: updatedAt,
            });
            return { success: true, meta: {} };
          }
          if (sql.includes("INSERT INTO sessions")) {
            const [
              id,
              patronId,
              email,
              role,
              tierId,
              tierName,
              pledgeCents,
              encAccess,
              encRefresh,
              tokExp,
              exp,
              revoked,
              createdAt,
              lastVerified,
            ] = stmt.params as [
              string,
              string,
              string | null,
              "admin" | "comp" | "patron",
              string,
              string,
              number,
              string,
              string,
              number,
              number,
              number,
              number,
              number,
            ];
            const existing = sessions.get(id);
            sessions.set(id, {
              id,
              patron_id: patronId,
              email,
              role,
              tier_id: tierId,
              tier_name: tierName,
              pledge_cents: pledgeCents,
              encrypted_access_token: encAccess,
              encrypted_refresh_token: encRefresh,
              token_expires_at_sec: tokExp,
              expires_at_sec: exp,
              revoked,
              created_at_sec: existing?.created_at_sec ?? createdAt,
              last_verified_at_sec: lastVerified,
            });
            return { success: true, meta: {} };
          }
          if (sql.includes("UPDATE sessions SET revoked = 1 WHERE id = ?")) {
            const id = stmt.params[0] as string;
            const existing = sessions.get(id);
            if (existing) {
              existing.revoked = 1;
            }
            return { success: true, meta: {} };
          }
          throw new Error(`Unhandled run query in mock: ${sql}`);
        },
      };
      return stmt;
    },
  } as unknown as D1Database;

  return { db, overrides, sessions };
}

describe("parseInitialAdminPatreonIds", () => {
  it("returns empty Set for null, undefined, or empty string", () => {
    assert.equal(parseInitialAdminPatreonIds(null).size, 0);
    assert.equal(parseInitialAdminPatreonIds(undefined).size, 0);
    assert.equal(parseInitialAdminPatreonIds("").size, 0);
    assert.equal(parseInitialAdminPatreonIds("   ").size, 0);
  });

  it("parses single and multiple comma-separated IDs", () => {
    const single = parseInitialAdminPatreonIds("12345678");
    assert.equal(single.size, 1);
    assert.ok(single.has("12345678"));

    const multi = parseInitialAdminPatreonIds("12345678,87654321,99999999");
    assert.equal(multi.size, 3);
    assert.ok(multi.has("12345678"));
    assert.ok(multi.has("87654321"));
    assert.ok(multi.has("99999999"));
  });

  it("trims whitespace and ignores empty entries", () => {
    const result = parseInitialAdminPatreonIds("  12345678 , ,  87654321  ");
    assert.equal(result.size, 2);
    assert.ok(result.has("12345678"));
    assert.ok(result.has("87654321"));
  });

  it("strips outer double and single quotes from environment variables", () => {
    const doubleQuoted = parseInitialAdminPatreonIds('"12345678, 87654321"');
    assert.equal(doubleQuoted.size, 2);
    assert.ok(doubleQuoted.has("12345678"));
    assert.ok(doubleQuoted.has("87654321"));

    const singleQuoted = parseInitialAdminPatreonIds("'12345678, 87654321'");
    assert.equal(singleQuoted.size, 2);
    assert.ok(singleQuoted.has("12345678"));
    assert.ok(singleQuoted.has("87654321"));
  });

  it("strips per-item quotes in comma-separated strings", () => {
    const perItem = parseInitialAdminPatreonIds('"12345678", "87654321"');
    assert.equal(perItem.size, 2);
    assert.ok(perItem.has("12345678"));
    assert.ok(perItem.has("87654321"));
  });
});

describe("isCreatorAdmin & assertCanModifyOverride (Creator Admin Immutability)", () => {
  it("identifies creator admins from single or multiple configured IDs", () => {
    assert.equal(isCreatorAdmin("12345678", "12345678"), true);
    assert.equal(isCreatorAdmin("87654321", "12345678, 87654321"), true);
    assert.equal(isCreatorAdmin("99999999", "12345678, 87654321"), false);
    assert.equal(isCreatorAdmin("", "12345678"), false);
    assert.equal(isCreatorAdmin("12345678", null), false);
    assert.equal(isCreatorAdmin("12345678", undefined), false);
  });

  it("assertCanModifyOverride throws an error when attempting to modify a Creator Admin", () => {
    assert.throws(
      () => assertCanModifyOverride("12345678", "12345678, 87654321"),
      /Creator Admin '12345678' is sealed and cannot be modified or deleted/
    );
  });

  it("assertCanModifyOverride does not throw when target is not a Creator Admin", () => {
    assert.doesNotThrow(() => assertCanModifyOverride("panel-admin-55", "12345678, 87654321"));
  });
});

describe("bootstrapInitialAdminIfEligible", () => {
  it("returns false when patronId is not in initialAdminIds", async () => {
    const { db, overrides } = createMockD1();
    const bootstrapped = await bootstrapInitialAdminIfEligible(db, "99999999", "12345678,87654321");
    assert.equal(bootstrapped, false);
    assert.equal(overrides.size, 0);
  });

  it("returns true and writes override with creator_bootstrap when patronId matches", async () => {
    const { db, overrides } = createMockD1();
    const bootstrapped = await bootstrapInitialAdminIfEligible(db, "12345678", "12345678,87654321");
    assert.equal(bootstrapped, true);
    assert.equal(overrides.size, 1);

    const record = overrides.get("12345678");
    assert.ok(record);
    assert.equal(record.patron_id, "12345678");
    assert.equal(record.role, "admin");
    assert.equal(record.granted_by, "system_bootstrap");
    assert.equal(record.notes, "Creator Admin (Sealed)");
  });
});

describe("syncInitialAdminOverrides", () => {
  it("returns empty array when no IDs are provided", async () => {
    const { db, overrides } = createMockD1();
    const synced = await syncInitialAdminOverrides(db, null);
    assert.deepEqual(synced, []);
    assert.equal(overrides.size, 0);
  });

  it("synchronizes all provided IDs into patron_overrides with creator_bootstrap role", async () => {
    const { db, overrides } = createMockD1();
    const synced = await syncInitialAdminOverrides(db, "10001, 10002, 10003");
    assert.equal(synced.length, 3);
    assert.deepEqual(synced.sort(), ["10001", "10002", "10003"]);
    assert.equal(overrides.size, 3);

    for (const id of ["10001", "10002", "10003"]) {
      const record = overrides.get(id);
      assert.ok(record);
      assert.equal(record.role, "admin");
      assert.equal(record.granted_by, "system_bootstrap");
      assert.equal(record.notes, "Creator Admin (Sealed)");
    }
  });
});

describe("getAuthEnv CREATOR_ADMIN_PATREON_IDS and fallback resolution", () => {
  it("prefers CREATOR_ADMIN_PATREON_IDS over INITIAL_ADMIN_PATREON_IDS when both are present", async () => {
    const env = await getAuthEnv({
      CREATOR_ADMIN_PATREON_IDS: "creator-1,creator-2",
      INITIAL_ADMIN_PATREON_IDS: "initial-1,initial-2",
    });
    assert.equal(env.creatorAdminPatreonIds, "creator-1,creator-2");
    assert.equal(env.initialAdminPatreonIds, "creator-1,creator-2");
  });

  it("falls back to INITIAL_ADMIN_PATREON_IDS when CREATOR_ADMIN_PATREON_IDS is not provided", async () => {
    const env = await getAuthEnv({
      INITIAL_ADMIN_PATREON_IDS: "initial-1,initial-2",
    });
    assert.equal(env.creatorAdminPatreonIds, "initial-1,initial-2");
    assert.equal(env.initialAdminPatreonIds, "initial-1,initial-2");
  });
});

describe("validateSessionAccess with initialAdminIds and elevation", () => {
  const SECRET = "test-session-secret-32-chars-long!";
  const NOW = 1750000000;

  it("auto-bootstraps override and elevates a patron session when patron_id is in initialAdminIds", async () => {
    const { db, sessions, overrides } = createMockD1();
    const sessionId = "session-test-elevate";
    sessions.set(sessionId, {
      id: sessionId,
      patron_id: "admin-patron-99",
      email: "founder@example.com",
      role: "patron",
      tier_id: "tier_0",
      tier_name: "No Pledge",
      pledge_cents: 0,
      encrypted_access_token: "enc_access",
      encrypted_refresh_token: "enc_refresh",
      token_expires_at_sec: NOW + 3600,
      expires_at_sec: NOW + 3600,
      revoked: 0,
      created_at_sec: NOW - 100,
      last_verified_at_sec: NOW - 100,
    });

    const cookie = await signValue(sessionId, SECRET);
    const result = await validateSessionAccess({
      db,
      sessionCookie: cookie,
      sessionSecret: SECRET,
      nowSec: NOW,
      initialAdminIds: "admin-patron-99,other-admin",
    });

    assert.equal(result.status, "authorized");
    if (result.status === "authorized") {
      assert.equal(result.session.role, "admin");
      assert.equal(result.session.tier_name, "Studio Admin");
    }

    const overrideRecord = overrides.get("admin-patron-99");
    assert.ok(overrideRecord);
    assert.equal(overrideRecord.role, "admin");
    assert.equal(overrideRecord.granted_by, "system_bootstrap");
    const updatedSession = sessions.get(sessionId);
    assert.equal(updatedSession?.role, "admin");
  });

  it("elevates a patron session if an existing override is present in DB", async () => {
    const { db, sessions, overrides } = createMockD1();
    const sessionId = "session-test-override";
    sessions.set(sessionId, {
      id: sessionId,
      patron_id: "comp-patron-42",
      email: "tester@example.com",
      role: "patron",
      tier_id: "tier_0",
      tier_name: "No Pledge",
      pledge_cents: 0,
      encrypted_access_token: "enc_access",
      encrypted_refresh_token: "enc_refresh",
      token_expires_at_sec: NOW + 3600,
      expires_at_sec: NOW + 3600,
      revoked: 0,
      created_at_sec: NOW - 100,
      last_verified_at_sec: NOW - 100,
    });

    overrides.set("comp-patron-42", {
      patron_id: "comp-patron-42",
      role: "comp",
      notes: "VIP Playtester",
      granted_by: "studio_lead",
      created_at_sec: NOW - 200,
      updated_at_sec: NOW - 200,
    });

    const cookie = await signValue(sessionId, SECRET);
    const result = await validateSessionAccess({
      db,
      sessionCookie: cookie,
      sessionSecret: SECRET,
      nowSec: NOW,
    });

    assert.equal(result.status, "authorized");
    if (result.status === "authorized") {
      assert.equal(result.session.role, "comp");
      assert.equal(result.session.tier_name, "Complimentary Pass");
    }
  });

  it("returns unauthorized for non-admin patron without sufficient pledge", async () => {
    const { db, sessions } = createMockD1();
    const sessionId = "session-unpledged";
    sessions.set(sessionId, {
      id: sessionId,
      patron_id: "regular-visitor-7",
      email: "visitor@example.com",
      role: "patron",
      tier_id: "tier_0",
      tier_name: "No Pledge",
      pledge_cents: 0,
      encrypted_access_token: "enc_access",
      encrypted_refresh_token: "enc_refresh",
      token_expires_at_sec: NOW + 3600,
      expires_at_sec: NOW + 3600,
      revoked: 0,
      created_at_sec: NOW - 100,
      last_verified_at_sec: NOW - 100,
    });

    const cookie = await signValue(sessionId, SECRET);
    const result = await validateSessionAccess({
      db,
      sessionCookie: cookie,
      sessionSecret: SECRET,
      nowSec: NOW,
      initialAdminIds: "12345,67890",
    });

    assert.equal(result.status, "unauthorized");
  });
});
