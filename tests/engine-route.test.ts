import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET, HEAD } from "../src/app/engine/[...path]/route";
import { signValue } from "../src/lib/crypto";
import { resetSessionValidationMemo } from "../src/lib/session-validation-memo";
import type { SessionRecord } from "../src/types/database";

const TEST_SECRET = "test-session-secret-at-least-32-chars-long!";
process.env.SESSION_SECRET = TEST_SECRET;

function createSessionFixture(overrides: Partial<SessionRecord> = {}): SessionRecord {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: "session-uuid-1234",
    patron_id: "123456789",
    email: "patron@example.com",
    role: "patron",
    tier_id: "tier_500",
    tier_name: "Ork Patron",
    pledge_cents: 500,
    encrypted_access_token: "enc_access_token",
    encrypted_refresh_token: "enc_refresh_token",
    token_expires_at_sec: now + 2592000,
    expires_at_sec: now + 2592000,
    revoked: 0,
    created_at_sec: now,
    last_verified_at_sec: now,
    ...overrides,
  };
}

function createMockD1(initialSessions: SessionRecord[] = []) {
  const sessions = new Map<string, SessionRecord>(
    initialSessions.map((s) => [s.id, { ...s }])
  );

  return {
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
            return null;
          }
          throw new Error(`Unhandled query: ${sql}`);
        },
      };
      return stmt;
    },
  } as unknown as D1Database;
}

interface MockFileDef {
  data: Uint8Array | string;
  contentType?: string;
  etag?: string;
}

function createMockR2Bucket(files: Record<string, MockFileDef>) {
  const fileEntries = new Map<
    string,
    { buffer: Uint8Array; contentType?: string; etag: string }
  >();
  for (const [k, v] of Object.entries(files)) {
    const buffer =
      typeof v.data === "string" ? new TextEncoder().encode(v.data) : v.data;
    fileEntries.set(k, {
      buffer,
      contentType: v.contentType,
      etag: v.etag || `"${Buffer.from(k).toString("hex")}"`,
    });
  }

  return {
    async head(key: string): Promise<R2Object | null> {
      const file = fileEntries.get(key);
      if (!file) return null;
      return {
        key,
        size: file.buffer.length,
        etag: file.etag,
        httpEtag: file.etag,
        httpMetadata: { contentType: file.contentType },
      } as unknown as R2Object;
    },
    async get(
      key: string,
      options?: R2GetOptions
    ): Promise<R2ObjectBody | null> {
      const file = fileEntries.get(key);
      if (!file) return null;

      let slice = file.buffer;
      if (options?.range) {
        const range = options.range as {
          offset?: number;
          length?: number;
          suffix?: number;
        };
        if (range.suffix !== undefined) {
          slice = file.buffer.slice(Math.max(0, file.buffer.length - range.suffix));
        } else if (range.offset !== undefined) {
          const offset = range.offset;
          const length =
            range.length !== undefined ? range.length : file.buffer.length - offset;
          slice = file.buffer.slice(offset, offset + length);
        }
      }

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(slice);
          controller.close();
        },
      });

      return {
        key,
        size: file.buffer.length,
        etag: file.etag,
        httpEtag: file.etag,
        httpMetadata: { contentType: file.contentType },
        body: stream,
      } as unknown as R2ObjectBody;
    },
  } as unknown as R2Bucket;
}

function makeRequest(
  urlPath: string,
  options: {
    method?: string;
    cookies?: Record<string, string>;
    headers?: Record<string, string>;
  } = {}
): NextRequest {
  const url = new URL(urlPath, "https://portal.test");
  const headers = new Headers(options.headers);

  if (options.cookies) {
    const cookieParts = Object.entries(options.cookies).map(
      ([k, v]) => `${k}=${encodeURIComponent(v)}`
    );
    headers.set("cookie", cookieParts.join("; "));
  }

  return new NextRequest(url, {
    method: options.method || "GET",
    headers,
  });
}

const SHELL_HTML = "<html><body>Real MZ Shell</body></html>";

describe("engine shell route GET & HEAD /engine/*", () => {
  let validSignedCookie: string;

  beforeEach(async () => {
    resetSessionValidationMemo();
    validSignedCookie = await signValue("session-uuid-1234", TEST_SECRET);
    globalThis.__D1_TEST_DB__ = createMockD1([createSessionFixture()]);
    // Bucket holds a published shell under the engine/ prefix.
    globalThis.__R2_TEST_BUCKET__ = createMockR2Bucket({
      "engine/index.html": { data: SHELL_HTML, contentType: "text/html", etag: '"etag-shell-html"' },
    });
  });

  it("amortises a burst of shell requests into one session validation", async () => {
    let d1Queries = 0;
    const trackingDb = {
      prepare(_sql: string) {
        return {
          bind() {
            return {
              async first() {
                d1Queries++;
                return createSessionFixture();
              },
            };
          },
        };
      },
    } as unknown as D1Database;
    globalThis.__D1_TEST_DB__ = trackingDb;

    for (let i = 0; i < 5; i++) {
      const req = makeRequest("/engine/index.html", {
        cookies: {
          ropoductions_age_verified: "true",
          ropoductions_session: validSignedCookie,
        },
      });
      const res = await GET(req, { params: Promise.resolve({ path: ["index.html"] }) });
      assert.equal(res.status, 200);
    }

    assert.equal(d1Queries, 1);
  });

  it("serves the open mock harness for /engine/index.html when no shell is published", async () => {
    globalThis.__R2_TEST_BUCKET__ = createMockR2Bucket({});
    const req = makeRequest("/engine/index.html");
    const res = await GET(req, { params: Promise.resolve({ path: ["index.html"] }) });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal(res.headers.get("content-type"), "text/html");
    const body = await res.text();
    assert.match(body, /<canvas id="gameCanvas"/);
    assert.match(body, /Final Orginity/);
  });

  it("serves the open mock WebBridge plugin when no shell is published", async () => {
    globalThis.__R2_TEST_BUCKET__ = createMockR2Bucket({});
    const req = makeRequest("/engine/js/plugins/Ropoductions_WebBridge.js");
    const res = await GET(req, {
      params: Promise.resolve({ path: ["js", "plugins", "Ropoductions_WebBridge.js"] }),
    });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "text/javascript");
    const body = await res.text();
    assert.match(body, /Ropoductions Web Bridge Plugin/);
  });

  it("returns 404 for unknown shell paths when no shell is published", async () => {
    globalThis.__R2_TEST_BUCKET__ = createMockR2Bucket({});
    const req = makeRequest("/engine/css/game.css");
    const res = await GET(req, { params: Promise.resolve({ path: ["css", "game.css"] }) });

    assert.equal(res.status, 404);
  });

  it("serves only the open mock to anonymous visitors even when a shell is published (no existence oracle)", async () => {
    const req = makeRequest("/engine/index.html");
    const res = await GET(req, { params: Promise.resolve({ path: ["index.html"] }) });

    // Anonymous users never touch R2 or D1: they see the same harmless mock
    // whether or not a shell exists, so release state is not disclosed.
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.match(await res.text(), /<canvas id="gameCanvas"/);
  });

  it("serves a 404 to anonymous visitors for non-mock shell paths, regardless of shell state", async () => {
    const req = makeRequest("/engine/css/game.css");
    const res = await GET(req, { params: Promise.resolve({ path: ["css", "game.css"] }) });

    assert.equal(res.status, 404);
  });

  it("streams a published shell document for a valid patron session", async () => {
    const req = makeRequest("/engine/index.html", {
      cookies: {
        ropoductions_age_verified: "true",
        ropoductions_session: validSignedCookie,
      },
    });
    const res = await GET(req, { params: Promise.resolve({ path: ["index.html"] }) });

    assert.equal(res.status, 200);
    // The document revalidates: it is how a browser discovers the shell the ingest
    // pipeline published last, and every file it references is release-addressed.
    assert.equal(res.headers.get("cache-control"), "private, no-cache");
    assert.equal(res.headers.get("vary"), "Cookie");
    assert.equal(res.headers.get("cross-origin-resource-policy"), "same-origin");
    assert.equal(res.headers.get("accept-ranges"), "bytes");
    assert.equal(res.headers.get("etag"), '"etag-shell-html"');
    assert.equal(res.headers.get("content-type"), "text/html");
    assert.equal(await res.text(), SHELL_HTML);
  });

  it("caches a release-addressed shell file immutably for a valid patron session", async () => {
    globalThis.__R2_TEST_BUCKET__ = createMockR2Bucket({
      "engine/js/main.js": { data: "console.log('mz');", contentType: "text/javascript" },
    });
    const req = makeRequest(`/engine/js/main.js?v=${"c".repeat(64)}`, {
      cookies: {
        ropoductions_age_verified: "true",
        ropoductions_session: validSignedCookie,
      },
    });
    const res = await GET(req, { params: Promise.resolve({ path: ["js", "main.js"] }) });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "private, immutable, max-age=31536000");
    assert.equal(res.headers.get("vary"), "Cookie");
  });

  it("keeps the moderate cache for a shell file the pipeline did not address", async () => {
    globalThis.__R2_TEST_BUCKET__ = createMockR2Bucket({
      "engine/js/plugin-that-builds-its-own-url.js": { data: "// plugin", contentType: "text/javascript" },
    });
    const req = makeRequest("/engine/js/plugin-that-builds-its-own-url.js", {
      cookies: {
        ropoductions_age_verified: "true",
        ropoductions_session: validSignedCookie,
      },
    });
    const res = await GET(req, {
      params: Promise.resolve({ path: ["js", "plugin-that-builds-its-own-url.js"] }),
    });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "private, max-age=86400");
  });

  it("does not treat a malformed identifier as a release address", async () => {
    globalThis.__R2_TEST_BUCKET__ = createMockR2Bucket({
      "engine/js/main.js": { data: "console.log('mz');", contentType: "text/javascript" },
    });
    const req = makeRequest("/engine/js/main.js?v=8c0be72", {
      cookies: {
        ropoductions_age_verified: "true",
        ropoductions_session: validSignedCookie,
      },
    });
    const res = await GET(req, { params: Promise.resolve({ path: ["js", "main.js"] }) });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "private, max-age=86400");
  });

  it("never serves the ingest pipeline's release metadata", async () => {
    globalThis.__R2_TEST_BUCKET__ = createMockR2Bucket({
      "engine/build-metadata.json": {
        data: JSON.stringify({ releaseId: "d".repeat(64) }),
        contentType: "application/json",
      },
    });
    const req = makeRequest("/engine/build-metadata.json", {
      cookies: {
        ropoductions_age_verified: "true",
        ropoductions_session: validSignedCookie,
      },
    });
    const res = await GET(req, { params: Promise.resolve({ path: ["build-metadata.json"] }) });

    assert.equal(res.status, 400);
    assert.equal(res.headers.get("cache-control"), "no-store");
  });

  it("answers an unsatisfiable range without caching the error", async () => {
    globalThis.__R2_TEST_BUCKET__ = createMockR2Bucket({
      "engine/js/main.js": {
        data: new Uint8Array(1000).fill(66),
        contentType: "text/javascript",
      },
    });
    const req = makeRequest("/engine/js/main.js", {
      headers: { range: "bytes=5000-6000" },
      cookies: {
        ropoductions_age_verified: "true",
        ropoductions_session: validSignedCookie,
      },
    });
    const res = await GET(req, { params: Promise.resolve({ path: ["js", "main.js"] }) });

    assert.equal(res.status, 416);
    assert.equal(res.headers.get("content-range"), "bytes */1000");
    assert.equal(res.headers.get("cache-control"), "no-store");
  });

  it("returns 304 for a published shell with a matching If-None-Match and session", async () => {
    const req = makeRequest("/engine/index.html", {
      headers: { "if-none-match": '"etag-shell-html"' },
      cookies: {
        ropoductions_age_verified: "true",
        ropoductions_session: validSignedCookie,
      },
    });
    const res = await GET(req, { params: Promise.resolve({ path: ["index.html"] }) });

    assert.equal(res.status, 304);
  });

  it("returns 206 partial content for a range request on a published shell", async () => {
    globalThis.__R2_TEST_BUCKET__ = createMockR2Bucket({
      "engine/js/main.js": {
        data: new Uint8Array(1000).fill(66),
        contentType: "text/javascript",
        etag: '"etag-main-js"',
      },
    });
    const req = makeRequest("/engine/js/main.js", {
      headers: { range: "bytes=100-299" },
      cookies: {
        ropoductions_age_verified: "true",
        ropoductions_session: validSignedCookie,
      },
    });
    const res = await GET(req, { params: Promise.resolve({ path: ["js", "main.js"] }) });

    assert.equal(res.status, 206);
    assert.equal(res.headers.get("content-range"), "bytes 100-299/1000");
    assert.equal(res.headers.get("content-length"), "200");
    const bytes = new Uint8Array(await res.arrayBuffer());
    assert.equal(bytes.length, 200);
    assert.equal(bytes[0], 66);
  });

  it("rejects path traversal without an R2 hit", async () => {
    globalThis.__R2_TEST_BUCKET__ = createMockR2Bucket({});
    const req = makeRequest("/engine/../../etc/passwd");
    const res = await GET(req, { params: Promise.resolve({ path: ["..", "..", "etc", "passwd"] }) });

    assert.equal(res.status, 400);
  });

  it("supports HEAD on a published shell for a valid session", async () => {
    const req = makeRequest("/engine/index.html", {
      method: "HEAD",
      cookies: {
        ropoductions_age_verified: "true",
        ropoductions_session: validSignedCookie,
      },
    });
    const res = await HEAD(req, { params: Promise.resolve({ path: ["index.html"] }) });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-length"), SHELL_HTML.length.toString());
    assert.equal(await res.text(), "");
  });

  it("gates a published shell behind D1 authorization: forged cookie gets 403", async () => {
    const tampered = validSignedCookie.slice(0, -4) + "XXXX";
    const req = makeRequest("/engine/index.html", {
      cookies: {
        ropoductions_age_verified: "true",
        ropoductions_session: tampered,
      },
    });
    const res = await GET(req, { params: Promise.resolve({ path: ["index.html"] }) });

    assert.equal(res.status, 403);
  });

  it("keeps the gate fail-closed when validation fails instead of serving the dev harness", async () => {
    globalThis.__D1_TEST_DB__ = {
      prepare() {
        return {
          bind() {
            return {
              async first(): Promise<never> {
                throw new Error("d1 unavailable");
              },
            };
          },
        };
      },
    } as unknown as D1Database;

    const previousNodeEnv = process.env.NODE_ENV;
    const mutableEnv = process.env as Record<string, string | undefined>;
    mutableEnv.NODE_ENV = "production";
    try {
      const req = makeRequest("/engine/index.html", {
        cookies: {
          ropoductions_age_verified: "true",
          ropoductions_session: validSignedCookie,
        },
      });
      const res = await GET(req, { params: Promise.resolve({ path: ["index.html"] }) });

      assert.equal(res.status, 500);
      const json = (await res.json()) as { error: { code: string } };
      assert.equal(json.error.code, "INTERNAL_ERROR");
    } finally {
      mutableEnv.NODE_ENV = previousNodeEnv;
    }
  });

  it("costs no D1 read for requests the route answers before validation", async () => {
    let d1Queries = 0;
    globalThis.__D1_TEST_DB__ = {
      prepare() {
        return {
          bind() {
            return {
              async first() {
                d1Queries++;
                return createSessionFixture();
              },
            };
          },
        };
      },
    } as unknown as D1Database;
    globalThis.__R2_TEST_BUCKET__ = createMockR2Bucket({});

    const anonymous = await GET(makeRequest("/engine/index.html"), {
      params: Promise.resolve({ path: ["index.html"] }),
    });
    assert.equal(anonymous.status, 200, "anonymous caller gets the open harness");

    const withoutAgeGate = await GET(
      makeRequest("/engine/index.html", {
        cookies: { ropoductions_session: validSignedCookie },
      }),
      { params: Promise.resolve({ path: ["index.html"] }) }
    );
    assert.equal(withoutAgeGate.status, 200, "a session without the age gate is still anonymous");

    assert.equal(d1Queries, 0);
  });

  it("shares one in-flight validation across a concurrent shell burst", async () => {
    let d1Queries = 0;
    globalThis.__D1_TEST_DB__ = {
      prepare() {
        return {
          bind() {
            return {
              async first() {
                d1Queries++;
                return createSessionFixture();
              },
            };
          },
        };
      },
    } as unknown as D1Database;

    const responses = await Promise.all(
      Array.from({ length: 12 }, () =>
        GET(
          makeRequest("/engine/index.html", {
            cookies: {
              ropoductions_age_verified: "true",
              ropoductions_session: validSignedCookie,
            },
          }),
          { params: Promise.resolve({ path: ["index.html"] }) }
        )
      )
    );

    for (const res of responses) {
      assert.equal(res.status, 200);
    }
    assert.equal(d1Queries, 1, "a cold cache must cost one session read for the whole burst");
  });
});