import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
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

type Row = Record<string, unknown>;

function sessionFixture(id: string, overrides: Row = {}): Row {
  return {
    id,
    patron_id: "patron-123",
    email: "patron-123@example.com",
    role: "patron",
    tier_id: "tier_ork",
    tier_name: "Ork Patron",
    pledge_cents: 500,
    encrypted_access_token: "enc-access-blob",
    encrypted_refresh_token: "enc-refresh-blob",
    token_expires_at_sec: 1800000000,
    expires_at_sec: 1800086400,
    revoked: 0,
    created_at_sec: 1700000000,
    last_verified_at_sec: 1700000000,
    ...overrides,
  };
}

function createMockDb(): D1Database {
  const sessions = new Map<string, Row>();
  const patronOverrides = new Map<string, Row>();

  const db = {
    prepare(sql: string) {
      const stmt = {
        params: [] as unknown[],
        bind(...params: unknown[]) {
          stmt.params = params;
          return stmt;
        },
        async first<T>(): Promise<T | null> {
          if (sql.includes("FROM sessions WHERE id = ?")) {
            return (sessions.get(stmt.params[0] as string) as T | undefined) ?? null;
          }
          if (sql.includes("FROM patron_overrides WHERE patron_id = ?")) {
            return (patronOverrides.get(stmt.params[0] as string) as T | undefined) ?? null;
          }
          throw new Error(`Unhandled first() query: ${sql}`);
        },
        async all<T>(): Promise<{ results: T[] }> {
          if (sql.includes("FROM sessions WHERE patron_id = ?")) {
            const results = [...sessions.values()]
              .filter((s) => s.patron_id === stmt.params[0])
              .sort((a, b) => (b.created_at_sec as number) - (a.created_at_sec as number));
            return { results: results as T[] };
          }
          if (sql.includes("FROM patron_overrides ORDER BY")) {
            const [limit, offset] = stmt.params as [number, number];
            const results = [...patronOverrides.values()]
              .sort((a, b) => (b.created_at_sec as number) - (a.created_at_sec as number))
              .slice(offset, offset + limit);
            return { results: results as T[] };
          }
          throw new Error(`Unhandled all() query: ${sql}`);
        },
        async run(): Promise<{ meta?: Record<string, unknown> }> {
          if (sql.startsWith("INSERT INTO sessions")) {
            const [
              id, patron_id, email, role, tier_id, tier_name, pledge_cents,
              encrypted_access_token, encrypted_refresh_token,
              token_expires_at_sec, expires_at_sec, revoked,
              createdAt, lastVerifiedAt, roleGuard, revokedGuard,
            ] = stmt.params as unknown[];
            const existing = sessions.get(id as string);
            if (!existing) {
              sessions.set(id as string, {
                id, patron_id, email, role, tier_id, tier_name, pledge_cents,
                encrypted_access_token, encrypted_refresh_token,
                token_expires_at_sec, expires_at_sec, revoked,
                created_at_sec: createdAt, last_verified_at_sec: lastVerifiedAt,
              });
              return { meta: {} };
            }
            if (roleGuard !== null) existing.role = role;
            if (revokedGuard !== null) existing.revoked = revoked;
            Object.assign(existing, {
              patron_id, email, tier_id, tier_name, pledge_cents,
              encrypted_access_token, encrypted_refresh_token,
              token_expires_at_sec, expires_at_sec,
              last_verified_at_sec: lastVerifiedAt,
            });
            return { meta: {} };
          }
          if (sql === "UPDATE sessions SET revoked = 1 WHERE id = ?") {
            const target = sessions.get(stmt.params[0] as string);
            if (target) target.revoked = 1;
            return { meta: {} };
          }
          if (sql === "UPDATE sessions SET revoked = 1 WHERE patron_id = ?") {
            for (const s of sessions.values()) {
              if (s.patron_id === stmt.params[0]) s.revoked = 1;
            }
            return { meta: {} };
          }
          if (sql === "DELETE FROM sessions WHERE id = ?") {
            sessions.delete(stmt.params[0] as string);
            return { meta: {} };
          }
          if (sql.startsWith("INSERT INTO patron_overrides")) {
            const [patron_id, role, notes, granted_by, createdAt, updatedAt, notesGuard] =
              stmt.params as unknown[];
            const existing = patronOverrides.get(patron_id as string);
            if (!existing) {
              patronOverrides.set(patron_id as string, {
                patron_id, role, notes, granted_by,
                created_at_sec: createdAt, updated_at_sec: updatedAt,
              });
              return { meta: {} };
            }
            existing.role = role;
            // granted_by is immutable attribution (set on INSERT only).
            existing.updated_at_sec = updatedAt;
            if (notesGuard !== null) existing.notes = notes;
            return { meta: {} };
          }
          if (sql === "DELETE FROM patron_overrides WHERE patron_id = ?") {
            const removed = patronOverrides.delete(stmt.params[0] as string);
            return { meta: { changes: removed ? 1 : 0 } };
          }
          throw new Error(`Unhandled run() query: ${sql}`);
        },
      };
      return stmt;
    },
  };
  return db as unknown as D1Database;
}

let db: D1Database;

beforeEach(() => {
  db = createMockDb();
});

describe("sessions data entry points", () => {
  it("persists and retrieves a patron session round-trip", async () => {
    await upsertSession(db, sessionFixture("sess-round-trip") as never);
    const fetched = await getSessionById(db, "sess-round-trip");

    assert.notEqual(fetched, null);
    assert.equal(fetched!.tier_name, "Ork Patron");
    assert.equal(fetched!.pledge_cents, 500);
    assert.equal(fetched!.revoked, 0);
  });

  it("defaults omitted role, revoked flag, and email on insert", async () => {
    const { role: _r, revoked: _v, email: _e, ...minimal } = sessionFixture("sess-minimal");
    await upsertSession(db, minimal as never);
    const fetched = await getSessionById(db, "sess-minimal");

    assert.equal(fetched!.role, "patron");
    assert.equal(fetched!.revoked, 0);
    assert.equal(fetched!.email, null);
  });

  it("resolves upsert conflicts by updating tier state while preserving creation time", async () => {
    await upsertSession(db, sessionFixture("sess-conflict") as never);
    await upsertSession(
      db,
      sessionFixture("sess-conflict", {
        tier_name: "Elf Sybarite",
        pledge_cents: 1500,
        created_at_sec: 1999999999,
        last_verified_at_sec: 1700001000,
      }) as never
    );
    const fetched = await getSessionById(db, "sess-conflict");

    assert.equal(fetched!.tier_name, "Elf Sybarite");
    assert.equal(fetched!.pledge_cents, 1500);
    assert.equal(fetched!.created_at_sec, 1700000000);
  });

  it("revokes a session without deleting its record", async () => {
    await upsertSession(db, sessionFixture("sess-revoke") as never);
    await revokeSession(db, "sess-revoke");

    assert.equal((await getSessionById(db, "sess-revoke"))!.revoked, 1);
  });

  it("treats revoking an unknown session as a no-op", async () => {
    await assert.doesNotReject(() => revokeSession(db, "sess-missing"));
    assert.equal(await getSessionById(db, "sess-missing"), null);
  });

  it("deletes a session so subsequent lookups miss", async () => {
    await upsertSession(db, sessionFixture("sess-delete") as never);
    await deleteSession(db, "sess-delete");

    assert.equal(await getSessionById(db, "sess-delete"), null);
  });

  it("lists a patron's sessions newest-first and revokes them together", async () => {
    await upsertSession(db, sessionFixture("sess-old", { created_at_sec: 1700000000 }) as never);
    await upsertSession(db, sessionFixture("sess-new", { created_at_sec: 1700000100 }) as never);

    const listed = await getSessionsByPatronId(db, "patron-123");
    assert.deepEqual(listed.map((s) => s.id), ["sess-new", "sess-old"]);

    await revokeSessionsByPatronId(db, "patron-123");
    const revoked = await getSessionsByPatronId(db, "patron-123");
    assert.ok(revoked.every((s) => s.revoked === 1));
  });

  it("treats bound parameters as literal values under an injection payload", async () => {
    await upsertSession(db, sessionFixture("sess-canary") as never);

    assert.equal(await getSessionById(db, "' OR '1'='1"), null);
    assert.notEqual(await getSessionById(db, "sess-canary"), null);
  });

  it("returns null for unknown session and override ids", async () => {
    assert.equal(await getSessionById(db, "sess-missing"), null);
    assert.equal(await getPatronOverride(db, "patron-missing"), null);
  });
});

describe("patron override entry points", () => {
  it("creates, updates, lists, and deletes an access override", async () => {
    await upsertPatronOverride(db, {
      patron_id: "patron-override-1",
      role: "admin",
      notes: "Studio staff bootstrap",
      granted_by: "system_bootstrap",
      created_at_sec: 1700000000,
      updated_at_sec: 1700000000,
    });
    assert.equal((await getPatronOverride(db, "patron-override-1"))!.role, "admin");

    await upsertPatronOverride(db, {
      patron_id: "patron-override-1",
      role: "comp",
      notes: "Complimentary tester pass",
      granted_by: "lead_dev",
      created_at_sec: 1999999999,
      updated_at_sec: 1700002000,
    });
    const updated = await getPatronOverride(db, "patron-override-1");
    assert.equal(updated!.role, "comp");
    assert.equal(updated!.created_at_sec, 1700000000);
    // granted_by is immutable attribution: original grantor survives the update.
    assert.equal(updated!.granted_by, "system_bootstrap");

    assert.ok(
      (await listPatronOverrides(db)).some((o) => o.patron_id === "patron-override-1")
    );

    await deletePatronOverrideGuarded(db, "patron-override-1");
    assert.equal(await getPatronOverride(db, "patron-override-1"), null);
  });
});
