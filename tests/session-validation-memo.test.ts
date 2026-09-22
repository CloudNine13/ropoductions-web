import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET as engineGET } from "../src/app/engine/[...path]/route";
import { GET as gameGET } from "../src/app/api/game/[[...asset]]/route";
import type { PatronOverrideRecord, SessionRecord } from "../src/types/database";
import { signValue } from "../src/lib/crypto";
import {
  createSessionValidationMemo,
  resetSessionValidationMemo,
  type SessionValidationMemo,
} from "../src/lib/session-validation-memo";

const SECRET = "test-session-secret-at-least-32-chars-long!";
const ROTATED_SECRET = "rotated-session-secret-at-least-32-chars!!";
process.env.SESSION_SECRET = SECRET;
const WALL_BASE = 1_750_000_000;
const SESSION_READ = "FROM sessions WHERE id = ?";
const OVERRIDE_READ = "FROM patron_overrides WHERE patron_id = ?";

interface Harness {
  db: D1Database;
  sessions: Map<string, SessionRecord>;
  overrides: Map<string, PatronOverrideRecord>;
  reads: () => { sessions: number; overrides: number };
  failNextSessionRead: boolean;
  gate: Promise<void> | null;
}

function createHarness(seed: {
  sessions?: SessionRecord[];
  overrides?: PatronOverrideRecord[];
} = {}): Harness {
  const sessions = new Map<string, SessionRecord>(
    (seed.sessions ?? []).map((s) => [s.id, { ...s }])
  );
  const overrides = new Map<string, PatronOverrideRecord>(
    (seed.overrides ?? []).map((o) => [o.patron_id, { ...o }])
  );
  const counts = { sessions: 0, overrides: 0 };
  const harness: Partial<Harness> = {
    sessions,
    overrides,
    reads: () => ({ ...counts }),
    failNextSessionRead: false,
    gate: null,
  };

  const db = {
    prepare(sql: string) {
      const stmt = {
        params: [] as unknown[],
        bind(...params: unknown[]) {
          stmt.params = params;
          return stmt;
        },
        async first<T>(): Promise<T | null> {
          if (sql.includes(SESSION_READ)) {
            counts.sessions++;
            if (harness.gate) {
              await harness.gate;
            }
            if (harness.failNextSessionRead) {
              harness.failNextSessionRead = false;
              throw new Error("D1 session read failed");
            }
            return (sessions.get(stmt.params[0] as string) as T | undefined) ?? null;
          }
          if (sql.includes(OVERRIDE_READ)) {
            counts.overrides++;
            return (overrides.get(stmt.params[0] as string) as T | undefined) ?? null;
          }
          throw new Error(`Unhandled query in first(): ${sql}`);
        },
        async run(): Promise<{ success: boolean; meta: Record<string, unknown> }> {
          if (sql.includes("UPDATE sessions SET revoked = 1")) {
            const session = sessions.get(stmt.params[0] as string);
            if (session) {
              sessions.set(session.id, { ...session, revoked: 1 });
            }
            return { success: true, meta: {} };
          }
          if (sql.includes("INSERT INTO sessions") || sql.includes("UPDATE sessions")) {
            return { success: true, meta: {} };
          }
          throw new Error(`Unhandled query in run(): ${sql}`);
        },
      };
      return stmt;
    },
  } as unknown as D1Database;

  return Object.assign(harness as Harness, { db });
}

function sessionFixture(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: "sess-burst-1",
    patron_id: "patron-1",
    email: null,
    role: "patron",
    tier_id: "tier_ork_5",
    tier_name: "Ork Patron",
    pledge_cents: 500,
    encrypted_access_token: "token-ciphertext",
    encrypted_refresh_token: "refresh-ciphertext",
    token_expires_at_sec: WALL_BASE + 3600,
    expires_at_sec: WALL_BASE + 3600,
    revoked: 0,
    created_at_sec: WALL_BASE - 60,
    last_verified_at_sec: WALL_BASE - 60,
    ...overrides,
  };
}

function overrideFixture(overrides: Partial<PatronOverrideRecord> = {}): PatronOverrideRecord {
  return {
    patron_id: "patron-1",
    role: "comp",
    notes: null,
    granted_by: "system_bootstrap",
    created_at_sec: WALL_BASE - 60,
    updated_at_sec: WALL_BASE - 60,
    ...overrides,
  };
}

interface Clocks {
  mono: number;
  wall: number;
}

function createMemo(clock: Clocks, options: { ttlSec?: number; maxEntries?: number } = {}) {
  return createSessionValidationMemo({
    ttlSec: options.ttlSec ?? 60,
    maxEntries: options.maxEntries ?? 256,
    nowMs: () => clock.mono,
    nowSec: () => clock.wall,
  });
}

function resolveWith(
  memo: SessionValidationMemo,
  harness: Harness,
  sessionCookie: string | null,
  sessionSecret: string = SECRET,
  nowSec?: number
) {
  return memo.resolve({
    db: harness.db,
    sessionCookie,
    sessionSecret,
    initialAdminIds: null,
    nowSec,
  });
}

describe("burst-safe session validation memo", () => {
  it("amortises a 65-request boot burst into one session read", async () => {
    const clock = { mono: 0, wall: WALL_BASE };
    const harness = createHarness({ sessions: [sessionFixture()] });
    const memo = createMemo(clock);
    const cookie = await signValue("sess-burst-1", SECRET);

    const statuses: string[] = [];
    for (let i = 0; i < 65; i++) {
      clock.mono += 5;
      statuses.push((await resolveWith(memo, harness, cookie)).status);
    }

    assert.deepEqual(new Set(statuses), new Set(["authorized"]));
    assert.equal(harness.reads().sessions, 1);
  });

  it("shares one in-flight validation across a concurrent burst", async () => {
    const clock = { mono: 0, wall: WALL_BASE };
    const harness = createHarness({ sessions: [sessionFixture()] });
    const memo = createMemo(clock);
    const cookie = await signValue("sess-burst-1", SECRET);

    let release = () => {};
    harness.gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const burst = Array.from({ length: 20 }, () => resolveWith(memo, harness, cookie));
    release();
    const verdicts = await Promise.all(burst);

    assert.deepEqual(new Set(verdicts.map((v) => v.status)), new Set(["authorized"]));
    assert.equal(harness.reads().sessions, 1);
  });

  it("denies a joiner whose own clock is past the session expiry", async () => {
    const clock = { mono: 0, wall: WALL_BASE };
    const harness = createHarness({
      sessions: [sessionFixture({ expires_at_sec: WALL_BASE + 5 })],
    });
    const memo = createMemo(clock);
    const cookie = await signValue("sess-burst-1", SECRET);

    let release = () => {};
    harness.gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const leader = resolveWith(memo, harness, cookie, SECRET, WALL_BASE);
    const joiner = resolveWith(memo, harness, cookie, SECRET, WALL_BASE + 6);
    release();

    assert.equal((await leader).status, "authorized");
    assert.equal((await joiner).status, "lapsed");
    assert.equal(harness.reads().sessions, 1);
  });

  it("costs no session read and retains nothing for anonymous or secret-less callers", async () => {
    const clock = { mono: 0, wall: WALL_BASE };
    const harness = createHarness({ sessions: [sessionFixture()] });
    const memo = createMemo(clock);

    assert.equal((await resolveWith(memo, harness, null)).status, "not_found");
    assert.equal((await resolveWith(memo, harness, "sess-burst-1", "")).status, "invalid_signature");
    assert.equal(harness.reads().sessions, 0);
    assert.deepEqual(memo.keys(), []);
  });

  it("never memoises forged cookies and never charges them a read", async () => {
    const clock = { mono: 0, wall: WALL_BASE };
    const harness = createHarness({ sessions: [sessionFixture()] });
    const memo = createMemo(clock);

    for (let i = 0; i < 300; i++) {
      const verdict = await resolveWith(memo, harness, `forged-${i}.signature`);
      assert.equal(verdict.status, "invalid_signature");
    }

    assert.equal(harness.reads().sessions, 0);
    assert.deepEqual(memo.keys(), []);

    const validCookie = await signValue("sess-burst-1", SECRET);
    assert.equal((await resolveWith(memo, harness, validCookie)).status, "authorized");
    assert.equal((await resolveWith(memo, harness, validCookie)).status, "authorized");
    assert.equal(harness.reads().sessions, 1);
  });

  it("revalidates every non-authorized verdict instead of caching it", async () => {
    const clock = { mono: 0, wall: WALL_BASE };
    const harness = createHarness({
      sessions: [sessionFixture({ revoked: 1 }), sessionFixture({ id: "sess-lapsed", expires_at_sec: WALL_BASE - 1 })],
    });
    const memo = createMemo(clock);

    const revokedCookie = await signValue("sess-burst-1", SECRET);
    const lapsedCookie = await signValue("sess-lapsed", SECRET);
    const unknownCookie = await signValue("sess-unknown", SECRET);

    for (let i = 0; i < 3; i++) {
      assert.equal((await resolveWith(memo, harness, revokedCookie)).status, "revoked");
      assert.equal((await resolveWith(memo, harness, lapsedCookie)).status, "lapsed");
      assert.equal((await resolveWith(memo, harness, unknownCookie)).status, "not_found");
    }

    assert.equal(harness.reads().sessions, 9);
    assert.deepEqual(memo.keys(), []);
  });

  it("propagates a validation failure without memoising it and retries next time", async () => {
    const clock = { mono: 0, wall: WALL_BASE };
    const harness = createHarness({ sessions: [sessionFixture()] });
    const memo = createMemo(clock);
    const cookie = await signValue("sess-burst-1", SECRET);

    harness.failNextSessionRead = true;
    await assert.rejects(() => resolveWith(memo, harness, cookie), /D1 session read failed/);
    assert.deepEqual(memo.keys(), []);

    assert.equal((await resolveWith(memo, harness, cookie)).status, "authorized");
    assert.equal(harness.reads().sessions, 2);
  });

  it("ends access within the window after a revocation", async () => {
    const clock = { mono: 0, wall: WALL_BASE };
    const harness = createHarness({ sessions: [sessionFixture()] });
    const memo = createMemo(clock);
    const cookie = await signValue("sess-burst-1", SECRET);

    assert.equal((await resolveWith(memo, harness, cookie)).status, "authorized");
    harness.sessions.set("sess-burst-1", { ...sessionFixture(), revoked: 1 });

    clock.mono += 59_000;
    clock.wall += 59;
    assert.equal((await resolveWith(memo, harness, cookie)).status, "authorized");
    assert.equal(harness.reads().sessions, 1);

    clock.mono += 2_000;
    clock.wall += 2;
    assert.equal((await resolveWith(memo, harness, cookie)).status, "revoked");
    assert.equal(harness.reads().sessions, 2);
  });

  it("never serves an entry past the session's own expiry", async () => {
    const clock = { mono: 0, wall: WALL_BASE };
    const harness = createHarness({
      sessions: [sessionFixture({ expires_at_sec: WALL_BASE + 5 })],
    });
    const memo = createMemo(clock);
    const cookie = await signValue("sess-burst-1", SECRET);

    assert.equal((await resolveWith(memo, harness, cookie)).status, "authorized");
    clock.mono += 6_000;
    clock.wall += 6;

    assert.equal((await resolveWith(memo, harness, cookie)).status, "lapsed");
    assert.equal(harness.reads().sessions, 2);
  });

  it("re-checks the wall clock, so a forward step cannot extend an entry", async () => {
    const clock = { mono: 0, wall: WALL_BASE };
    const harness = createHarness({
      sessions: [sessionFixture({ expires_at_sec: WALL_BASE + 5 })],
    });
    const memo = createMemo(clock);
    const cookie = await signValue("sess-burst-1", SECRET);

    assert.equal((await resolveWith(memo, harness, cookie)).status, "authorized");
    clock.wall = WALL_BASE + 10;

    assert.equal((await resolveWith(memo, harness, cookie)).status, "lapsed");
    assert.equal(harness.reads().sessions, 2);
  });

  it("bounds the window in elapsed time when the wall clock stands still", async () => {
    const clock = { mono: 0, wall: WALL_BASE };
    const harness = createHarness({ sessions: [sessionFixture()] });
    const memo = createMemo(clock);
    const cookie = await signValue("sess-burst-1", SECRET);

    assert.equal((await resolveWith(memo, harness, cookie)).status, "authorized");
    clock.mono += 61_000;

    assert.equal((await resolveWith(memo, harness, cookie)).status, "authorized");
    assert.equal(harness.reads().sessions, 2);
  });

  it("bounds an override-elevated session by the window, not its synthesized expiry", async () => {
    const clock = { mono: 0, wall: WALL_BASE };
    const harness = createHarness({
      sessions: [sessionFixture({ pledge_cents: 0 })],
      overrides: [overrideFixture()],
    });
    const memo = createMemo(clock);
    const cookie = await signValue("sess-burst-1", SECRET);

    assert.equal((await resolveWith(memo, harness, cookie)).status, "authorized");
    clock.mono += 30_000;
    assert.equal((await resolveWith(memo, harness, cookie)).status, "authorized");
    assert.equal(harness.reads().sessions, 1);
    assert.equal(harness.reads().overrides, 1);

    clock.mono += 31_000;
    clock.wall += 61;
    assert.equal((await resolveWith(memo, harness, cookie)).status, "authorized");
    assert.equal(harness.reads().sessions, 2);
  });

  it("misses every entry when the signing secret rotates", async () => {
    const clock = { mono: 0, wall: WALL_BASE };
    const harness = createHarness({ sessions: [sessionFixture()] });
    const memo = createMemo(clock);
    const cookie = await signValue("sess-burst-1", SECRET);

    assert.equal((await resolveWith(memo, harness, cookie)).status, "authorized");
    assert.equal(
      (await resolveWith(memo, harness, cookie, ROTATED_SECRET)).status,
      "invalid_signature"
    );
    assert.equal(harness.reads().sessions, 1);
    assert.equal(memo.keys().length, 1);
  });

  it("keeps distinct sessions on distinct entries", async () => {
    const clock = { mono: 0, wall: WALL_BASE };
    const harness = createHarness({
      sessions: [sessionFixture(), sessionFixture({ id: "sess-burst-2", patron_id: "patron-2" })],
    });
    const memo = createMemo(clock);
    const first = await signValue("sess-burst-1", SECRET);
    const second = await signValue("sess-burst-2", SECRET);

    assert.equal((await resolveWith(memo, harness, first)).status, "authorized");
    assert.equal((await resolveWith(memo, harness, second)).status, "authorized");
    assert.equal((await resolveWith(memo, harness, first)).status, "authorized");
    assert.equal((await resolveWith(memo, harness, second)).status, "authorized");

    assert.equal(harness.reads().sessions, 2);
    assert.equal(memo.keys().length, 2);
  });

  it("bounds retained entries and revalidates an evicted session", async () => {
    const clock = { mono: 0, wall: WALL_BASE };
    const harness = createHarness({
      sessions: [
        sessionFixture(),
        sessionFixture({ id: "sess-burst-2", patron_id: "patron-2" }),
        sessionFixture({ id: "sess-burst-3", patron_id: "patron-3" }),
      ],
    });
    const memo = createMemo(clock, { maxEntries: 2 });
    const cookies = await Promise.all(
      ["sess-burst-1", "sess-burst-2", "sess-burst-3"].map((id) => signValue(id, SECRET))
    );

    for (const cookie of cookies) {
      assert.equal((await resolveWith(memo, harness, cookie)).status, "authorized");
    }
    assert.equal(memo.keys().length, 2);

    assert.equal((await resolveWith(memo, harness, cookies[0])).status, "authorized");
    assert.equal(harness.reads().sessions, 4);
    assert.equal(memo.keys().length, 2);
  });

  it("keys on a full-length digest that never embeds the cookie", async () => {
    const clock = { mono: 0, wall: WALL_BASE };
    const harness = createHarness({
      sessions: [sessionFixture(), sessionFixture({ id: "sess-burst-2", patron_id: "patron-2" })],
    });
    const memo = createMemo(clock);
    const cookie = await signValue("sess-burst-1", SECRET);
    const otherCookie = await signValue("sess-burst-2", SECRET);

    await resolveWith(memo, harness, cookie);
    await resolveWith(memo, harness, otherCookie);
    assert.equal(harness.reads().sessions, 2);

    const keys = memo.keys();
    assert.equal(keys.length, 2);
    for (const key of keys) {
      assert.equal(key.length, 43);
      assert.equal(key.includes(cookie), false);
      assert.equal(key.includes("sess-burst-1"), false);
    }
    assert.notEqual(keys[0], keys[1]);
  });

  it("returns a bare status verdict and retains no session record", async () => {
    const clock = { mono: 0, wall: WALL_BASE };
    const harness = createHarness({ sessions: [sessionFixture()] });
    const memo = createMemo(clock);
    const cookie = await signValue("sess-burst-1", SECRET);

    const authorized = await resolveWith(memo, harness, cookie);
    assert.deepEqual(Object.keys(authorized), ["status"]);

    const denied = await resolveWith(memo, harness, await signValue("sess-unknown", SECRET));
    assert.deepEqual(Object.keys(denied), ["status"]);
  });

  it("revokes and revalidates an admin session whose override disappeared", async () => {
    const clock = { mono: 0, wall: WALL_BASE };
    const harness = createHarness({
      sessions: [sessionFixture({ role: "admin", tier_id: "override_admin" })],
    });
    const memo = createMemo(clock);
    const cookie = await signValue("sess-burst-1", SECRET);

    assert.equal((await resolveWith(memo, harness, cookie)).status, "override_deleted");
    assert.equal(harness.sessions.get("sess-burst-1")?.revoked, 1);
    assert.deepEqual(memo.keys(), []);

    assert.equal((await resolveWith(memo, harness, cookie)).status, "revoked");
    assert.equal(harness.reads().sessions, 2);
  });

  it("bounds retained entries when concurrent validations settle together", async () => {
    const clock = { mono: 0, wall: WALL_BASE };
    const sessions = [1, 2, 3, 4, 5].map((n) =>
      sessionFixture({ id: `sess-wave-${n}`, patron_id: `patron-${n}` })
    );
    const harness = createHarness({ sessions });
    const memo = createMemo(clock, { maxEntries: 2 });
    const cookies = await Promise.all(sessions.map((s) => signValue(s.id, SECRET)));

    let release = () => {};
    harness.gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const wave = cookies.map((cookie) => resolveWith(memo, harness, cookie));
    release();
    const verdicts = await Promise.all(wave);

    assert.deepEqual(new Set(verdicts.map((v) => v.status)), new Set(["authorized"]));
    assert.equal(harness.reads().sessions, 5);
    assert.equal(memo.keys().length, 2);
  });

  it("keeps a live verdict through a concurrent flood of forged cookies", async () => {
    const clock = { mono: 0, wall: WALL_BASE };
    const harness = createHarness({ sessions: [sessionFixture()] });
    const memo = createMemo(clock, { maxEntries: 1 });
    const cookie = await signValue("sess-burst-1", SECRET);

    assert.equal((await resolveWith(memo, harness, cookie)).status, "authorized");

    let release = () => {};
    harness.gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const flood = Array.from({ length: 50 }, (_, i) =>
      resolveWith(memo, harness, `forged-${i}.signature`)
    );
    release();
    const verdicts = await Promise.all(flood);

    assert.deepEqual(new Set(verdicts.map((v) => v.status)), new Set(["invalid_signature"]));
    assert.equal(harness.reads().sessions, 1);
    assert.equal((await resolveWith(memo, harness, cookie)).status, "authorized");
    assert.equal(harness.reads().sessions, 1);
  });

  it("shares one memo across the engine and asset route handlers", async () => {
    let d1Queries = 0;
    globalThis.__D1_TEST_DB__ = {
      prepare() {
        return {
          bind() {
            return {
              async first() {
                d1Queries++;
                return sessionFixture({
                  expires_at_sec: Math.floor(Date.now() / 1000) + 3600,
                });
              },
            };
          },
        };
      },
    } as unknown as D1Database;
    globalThis.__R2_TEST_BUCKET__ = { head: async () => null } as unknown as R2Bucket;
    resetSessionValidationMemo();

    const cookie = await signValue("sess-burst-1", SECRET);
    const cookies = { ropoductions_age_verified: "true", ropoductions_session: cookie };
    const request = (url: string) =>
      new NextRequest(`http://127.0.0.1:3100${url}`, {
        headers: {
          cookie: Object.entries(cookies)
            .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
            .join("; "),
        },
      });

    try {
      for (let i = 0; i < 4; i++) {
        const shell = await engineGET(request("/engine/index.html"), {
          params: Promise.resolve({ path: ["index.html"] }),
        });
        assert.equal(shell.status, 200);

        const media = await gameGET(request("/api/game"), {
          params: Promise.resolve({ asset: [] }),
        });
        assert.equal(media.status, 400);
      }

      assert.equal(d1Queries, 1);
    } finally {
      resetSessionValidationMemo();
      globalThis.__R2_TEST_BUCKET__ = undefined;
      globalThis.__D1_TEST_DB__ = undefined;
    }
  });

  it("drops the verdict of a validation that was already in flight when the store was reset", async () => {
    const clock = { mono: 0, wall: WALL_BASE };
    const harness = createHarness({ sessions: [sessionFixture()] });
    const memo = createMemo(clock);
    const cookie = await signValue("sess-burst-1", SECRET);

    const gate = Promise.withResolvers<void>();
    harness.gate = gate.promise;

    const inFlight = resolveWith(memo, harness, cookie);
    memo.reset();
    gate.resolve();

    assert.equal(
      (await inFlight).status,
      "authorized",
      "a caller whose validation was already running still gets its verdict"
    );
    assert.deepEqual(memo.keys(), [], "the cleared store must stay empty");
    assert.equal(harness.reads().sessions, 1);

    assert.equal((await resolveWith(memo, harness, cookie)).status, "authorized");
    assert.equal(
      harness.reads().sessions,
      2,
      "a request after the reset revalidates instead of reading the pre-reset verdict"
    );
  });
});
