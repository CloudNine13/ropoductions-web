import { after, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET as engineGET } from "../src/app/engine/[...path]/route";
import { GET as gameGET } from "../src/app/api/game/[[...asset]]/route";
import { signValue } from "../src/lib/crypto";
import { resetSessionValidationMemo } from "../src/lib/session-validation-memo";
import {
  ENGINE_BOOT_PROFILE,
  SHELL_FIXTURE_DOCUMENT,
  type BootProfileRequest,
} from "../e2e/fixtures/engine-boot-profile";

const SECRET = "test-session-secret-at-least-32-chars-long!";
process.env.SESSION_SECRET = SECRET;

const IMMUTABLE = "private, immutable, max-age=31536000";
const MODERATE = "private, max-age=86400";
const SESSION_READ = "FROM sessions WHERE id = ?";

interface ReadCounter {
  sessions: number;
  overrides: number;
  writes: number;
}

/**
 * Amortisation is per isolate, and D1 is the authority the browser cannot observe:
 * the burst's validation cost is measurable only against the real handlers.
 */
function createCountingD1(counter: ReadCounter): D1Database {
  const nowSec = Math.floor(Date.now() / 1000);
  const session = {
    id: "session-burst",
    patron_id: "424242",
    email: "burst@ropoductions.test",
    role: "patron",
    tier_id: "tier_500",
    tier_name: "Ork Patron",
    pledge_cents: 500,
    encrypted_access_token: "enc",
    encrypted_refresh_token: "enc",
    token_expires_at_sec: nowSec + 3600,
    expires_at_sec: nowSec + 3600,
    revoked: 0,
    created_at_sec: nowSec,
    last_verified_at_sec: nowSec,
  };

  return {
    prepare(sql: string) {
      const statement = {
        params: [] as unknown[],
        bind(...params: unknown[]) {
          statement.params = params;
          return statement;
        },
        async first<T>(): Promise<T | null> {
          if (sql.includes(SESSION_READ)) {
            counter.sessions += 1;
            return session as T;
          }
          if (sql.includes("FROM patron_overrides WHERE patron_id = ?")) {
            counter.overrides += 1;
            return null;
          }
          throw new Error(`Unhandled query: ${sql}`);
        },
        async run(): Promise<unknown> {
          counter.writes += 1;
          return {};
        },
      };
      return statement;
    },
  } as unknown as D1Database;
}

/** R2 stand-in seeded with the fixture profile, carrying the metadata the routes read. */
function createFixtureBucket(entries: BootProfileRequest[]): R2Bucket {
  const objects = new Map(
    entries.map((entry) => {
      const key = entry.route === "shell" ? `engine/${entry.key}` : entry.key;
      return [key, entry] as const;
    })
  );

  return {
    async head(key: string) {
      const entry = objects.get(key);
      if (!entry) return null;
      const size = Buffer.byteLength(entry.body);
      return {
        key,
        size,
        etag: `"${key}"`,
        httpEtag: `"${key}"`,
        httpMetadata: { contentType: entry.contentType },
      } as unknown as R2Object;
    },
    async get(key: string) {
      const entry = objects.get(key);
      if (!entry) return null;
      const bytes = new TextEncoder().encode(entry.body);
      return {
        key,
        size: bytes.length,
        etag: `"${key}"`,
        httpEtag: `"${key}"`,
        httpMetadata: { contentType: entry.contentType },
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes);
            controller.close();
          },
        }),
      } as unknown as R2ObjectBody;
    },
  } as unknown as R2Bucket;
}

function cookieHeader(cookie: string): string {
  return [
    `ropoductions_age_verified=true`,
    `ropoductions_session=${encodeURIComponent(cookie)}`,
  ].join("; ");
}

describe("asset burst", () => {
  const counter: ReadCounter = { sessions: 0, overrides: 0, writes: 0 };

  beforeEach(() => {
    counter.sessions = 0;
    counter.overrides = 0;
    counter.writes = 0;
  });

  after(() => {
    resetSessionValidationMemo();
    globalThis.__D1_TEST_DB__ = undefined;
    globalThis.__R2_TEST_BUCKET__ = undefined;
  });

  it("replays the boot request profile with 200/304 and one session validation read", async () => {
    assert.ok(
      ENGINE_BOOT_PROFILE.length >= 65,
      `boot profile must replay the measured 65+ gated requests, got ${ENGINE_BOOT_PROFILE.length}`
    );

    globalThis.__D1_TEST_DB__ = createCountingD1(counter);
    globalThis.__R2_TEST_BUCKET__ = createFixtureBucket(ENGINE_BOOT_PROFILE);
    resetSessionValidationMemo();

    const cookie = await signValue("session-burst", SECRET);
    const headers = { cookie: cookieHeader(cookie) };
    const statuses: number[] = [];

    const drive = async (entry: BootProfileRequest): Promise<Response> => {
      const request = new NextRequest(`http://127.0.0.1:3100${entry.url}`, { headers });
      if (entry.route === "shell") {
        return engineGET(request, {
          params: Promise.resolve({ path: entry.key.split("/") }),
        });
      }
      return gameGET(request, {
        params: Promise.resolve({ asset: entry.key.split("/") }),
      });
    };

    try {
      for (const entry of ENGINE_BOOT_PROFILE) {
        const response = await drive(entry);
        statuses.push(response.status);
        assert.equal(response.status, 200, `${entry.key} must stream the object`);

        const expectedCache =
          entry.key === SHELL_FIXTURE_DOCUMENT.key ? MODERATE : entry.addressed ? IMMUTABLE : MODERATE;
        assert.equal(
          response.headers.get("Cache-Control"),
          expectedCache,
          `${entry.key} cache policy`
        );

        const etag = response.headers.get("ETag");
        assert.ok(etag, `${entry.key} must carry an ETag`);

        const conditional = new NextRequest(`http://127.0.0.1:3100${entry.url}`, {
          headers: { ...headers, "if-none-match": etag as string },
        });
        const revalidated =
          entry.route === "shell"
            ? await engineGET(conditional, {
                params: Promise.resolve({ path: entry.key.split("/") }),
              })
            : await gameGET(conditional, {
                params: Promise.resolve({ asset: entry.key.split("/") }),
              });
        statuses.push(revalidated.status);
        assert.equal(revalidated.status, 304, `${entry.key} must revalidate to 304`);
      }

      assert.deepEqual(
        [...new Set(statuses)].sort((left, right) => left - right),
        [200, 304]
      );
      assert.equal(counter.sessions, 1, "one burst must cost one session validation read");
      assert.equal(counter.overrides, 0, "a pledge-funded patron needs no override read");
      assert.equal(counter.writes, 0, "a burst never writes to D1");
    } finally {
      resetSessionValidationMemo();
    }
  });

  it("refuses the whole burst without a session and costs zero D1 reads", async () => {
    globalThis.__D1_TEST_DB__ = createCountingD1(counter);
    globalThis.__R2_TEST_BUCKET__ = createFixtureBucket(ENGINE_BOOT_PROFILE);
    resetSessionValidationMemo();

    try {
      const anonymous = await engineGET(
        new NextRequest(`http://127.0.0.1:3100${ENGINE_BOOT_PROFILE[2].url}`),
        { params: Promise.resolve({ path: ENGINE_BOOT_PROFILE[2].key.split("/") }) }
      );
      assert.equal(anonymous.status, 404);
      assert.equal(counter.sessions, 0);
      assert.equal(counter.overrides, 0);
    } finally {
      resetSessionValidationMemo();
    }
  });
});
