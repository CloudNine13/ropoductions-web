import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET, HEAD } from "../src/app/api/game/[[...asset]]/route";
import { signValue } from "../src/lib/crypto";
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
  const sessions = new Map<string, SessionRecord>(initialSessions.map((s) => [s.id, { ...s }]));

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
  const fileEntries = new Map<string, { buffer: Uint8Array; contentType?: string; etag: string }>();
  for (const [k, v] of Object.entries(files)) {
    const buffer = typeof v.data === "string" ? new TextEncoder().encode(v.data) : v.data;
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
        httpMetadata: {
          contentType: file.contentType,
        },
      } as unknown as R2Object;
    },
    async get(key: string, options?: R2GetOptions): Promise<R2ObjectBody | null> {
      const file = fileEntries.get(key);
      if (!file) return null;

      let slice = file.buffer;
      if (options?.range) {
        const range = options.range as { offset?: number; length?: number; suffix?: number };
        if (range.suffix !== undefined) {
          slice = file.buffer.slice(Math.max(0, file.buffer.length - range.suffix));
        } else if (range.offset !== undefined) {
          const offset = range.offset;
          const length = range.length !== undefined ? range.length : file.buffer.length - offset;
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
        httpMetadata: {
          contentType: file.contentType,
        },
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

describe("authenticated r2 asset streaming route GET & HEAD /api/game/*", () => {
  const sampleJson = JSON.stringify({ gameTitle: "Final Orginity", version: "1.0.0" });
  const sample1000Bytes = new Uint8Array(1000).fill(65); // 1000 'A's

  let validSignedCookie: string;

  beforeEach(async () => {
    validSignedCookie = await signValue("session-uuid-1234", TEST_SECRET);
    globalThis.__D1_TEST_DB__ = createMockD1([createSessionFixture()]);
    globalThis.__R2_TEST_BUCKET__ = createMockR2Bucket({
      "data/System.json": { data: sampleJson, contentType: "application/json", etag: '"etag-system-json"' },
      "audio/bgm/Theme1.ogg": { data: sample1000Bytes, contentType: "audio/ogg", etag: '"etag-audio-ogg"' },
      "img/actors/Hero.rpgmvp": { data: new Uint8Array([0x52, 0x50, 0x47, 0x4d, 0x56]), etag: '"etag-hero-rpgmvp"' },
    });
  });

  it("rejects anonymous requests without cookies with 403 JSON envelope", async () => {
    const req = makeRequest("/api/game/data/System.json");
    const res = await GET(req, { params: Promise.resolve({ asset: ["data", "System.json"] }) });

    assert.equal(res.status, 403);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal(res.headers.get("cross-origin-resource-policy"), "same-origin");
    const json = (await res.json()) as { error: { code: string; message: string } };
    assert.equal(json.error.code, "UNAUTHORIZED");
  });

  it("rejects requests missing age verification with 403 JSON envelope", async () => {
    const req = makeRequest("/api/game/data/System.json", {
      cookies: { ropoductions_session: validSignedCookie },
    });
    const res = await GET(req, { params: Promise.resolve({ asset: ["data", "System.json"] }) });

    assert.equal(res.status, 403);
    assert.equal(res.headers.get("cache-control"), "no-store");
    const json = (await res.json()) as { error: { code: string; message: string } };
    assert.equal(json.error.code, "UNAUTHORIZED");
  });

  it("rejects requests with forged/tampered session cookie with 403 JSON envelope", async () => {
    const tampered = validSignedCookie.slice(0, -4) + "XXXX";
    const req = makeRequest("/api/game/data/System.json", {
      cookies: {
        ropoductions_age_verified: "true",
        ropoductions_session: tampered,
      },
    });
    const res = await GET(req, { params: Promise.resolve({ asset: ["data", "System.json"] }) });

    assert.equal(res.status, 403);
    const json = (await res.json()) as { error: { code: string; message: string } };
    assert.equal(json.error.code, "UNAUTHORIZED");
  });

  it("rejects expired/lapsed session in D1 with 403 JSON envelope", async () => {
    const expiredId = "session-expired-1";
    const now = Math.floor(Date.now() / 1000);
    globalThis.__D1_TEST_DB__ = createMockD1([
      createSessionFixture({ id: expiredId, expires_at_sec: now - 3600 }),
    ]);
    const expiredCookie = await signValue(expiredId, TEST_SECRET);

    const req = makeRequest("/api/game/data/System.json", {
      cookies: {
        ropoductions_age_verified: "true",
        ropoductions_session: expiredCookie,
      },
    });
    const res = await GET(req, { params: Promise.resolve({ asset: ["data", "System.json"] }) });

    assert.equal(res.status, 403);
    const json = (await res.json()) as { error: { code: string; message: string } };
    assert.equal(json.error.code, "UNAUTHORIZED");
  });

  it("prevents 304 bypass on lapsed sessions with matching If-None-Match", async () => {
    const expiredId = "session-lapsed-etag";
    const now = Math.floor(Date.now() / 1000);
    globalThis.__D1_TEST_DB__ = createMockD1([
      createSessionFixture({ id: expiredId, expires_at_sec: now - 3600 }),
    ]);
    const expiredCookie = await signValue(expiredId, TEST_SECRET);

    const req = makeRequest("/api/game/data/System.json", {
      headers: { "if-none-match": '"etag-system-json"' },
      cookies: {
        ropoductions_age_verified: "true",
        ropoductions_session: expiredCookie,
      },
    });
    const res = await GET(req, { params: Promise.resolve({ asset: ["data", "System.json"] }) });

    assert.equal(res.status, 403);
  });

  it("streams full asset from R2 for valid patron session with correct headers", async () => {
    const req = makeRequest("/api/game/data/System.json", {
      cookies: {
        ropoductions_age_verified: "true",
        ropoductions_session: validSignedCookie,
      },
    });
    const res = await GET(req, { params: Promise.resolve({ asset: ["data", "System.json"] }) });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "private, max-age=86400");
    assert.equal(res.headers.get("vary"), "Cookie");
    assert.equal(res.headers.get("cross-origin-resource-policy"), "same-origin");
    assert.equal(res.headers.get("accept-ranges"), "bytes");
    assert.equal(res.headers.get("etag"), '"etag-system-json"');
    assert.equal(res.headers.get("content-type"), "application/json");
    assert.equal(res.headers.get("content-length"), sampleJson.length.toString());

    const bodyText = await res.text();
    assert.equal(bodyText, sampleJson);
  });

  it("maps encrypted RPG Maker assets (.rpgmvp) to application/octet-stream", async () => {
    const req = makeRequest("/api/game/img/actors/Hero.rpgmvp", {
      cookies: {
        ropoductions_age_verified: "true",
        ropoductions_session: validSignedCookie,
      },
    });
    const res = await GET(req, { params: Promise.resolve({ asset: ["img", "actors", "Hero.rpgmvp"] }) });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/octet-stream");
    const bytes = new Uint8Array(await res.arrayBuffer());
    assert.deepEqual(bytes, new Uint8Array([0x52, 0x50, 0x47, 0x4d, 0x56]));
  });

  it("handles HTTP 206 Partial Content range requests for media playback", async () => {
    const req = makeRequest("/api/game/audio/bgm/Theme1.ogg", {
      headers: { range: "bytes=0-499" },
      cookies: {
        ropoductions_age_verified: "true",
        ropoductions_session: validSignedCookie,
      },
    });
    const res = await GET(req, { params: Promise.resolve({ asset: ["audio", "bgm", "Theme1.ogg"] }) });

    assert.equal(res.status, 206);
    assert.equal(res.headers.get("content-range"), "bytes 0-499/1000");
    assert.equal(res.headers.get("content-length"), "500");
    assert.equal(res.headers.get("cache-control"), "private, max-age=86400");
    assert.equal(res.headers.get("vary"), "Cookie");

    const bytes = new Uint8Array(await res.arrayBuffer());
    assert.equal(bytes.length, 500);
  });

  it("handles HTTP suffix range requests (bytes=-200)", async () => {
    const req = makeRequest("/api/game/audio/bgm/Theme1.ogg", {
      headers: { range: "bytes=-200" },
      cookies: {
        ropoductions_age_verified: "true",
        ropoductions_session: validSignedCookie,
      },
    });
    const res = await GET(req, { params: Promise.resolve({ asset: ["audio", "bgm", "Theme1.ogg"] }) });

    assert.equal(res.status, 206);
    assert.equal(res.headers.get("content-range"), "bytes 800-999/1000");
    assert.equal(res.headers.get("content-length"), "200");
  });

  it("returns HTTP 416 Range Not Satisfiable for out-of-bounds byte ranges", async () => {
    const req = makeRequest("/api/game/audio/bgm/Theme1.ogg", {
      headers: { range: "bytes=999999-" },
      cookies: {
        ropoductions_age_verified: "true",
        ropoductions_session: validSignedCookie,
      },
    });
    const res = await GET(req, { params: Promise.resolve({ asset: ["audio", "bgm", "Theme1.ogg"] }) });

    assert.equal(res.status, 416);
    assert.equal(res.headers.get("content-range"), "bytes */1000");
    assert.equal(res.headers.get("cache-control"), "no-store");
  });

  it("ignores invalid or multipart range headers per RFC 9110 and serves 200 full body", async () => {
    const req = makeRequest("/api/game/audio/bgm/Theme1.ogg", {
      headers: { range: "bytes=0-10, 20-30" },
      cookies: {
        ropoductions_age_verified: "true",
        ropoductions_session: validSignedCookie,
      },
    });
    const res = await GET(req, { params: Promise.resolve({ asset: ["audio", "bgm", "Theme1.ogg"] }) });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-length"), "1000");
  });

  it("returns 304 Not Modified with strict null body on matching If-None-Match", async () => {
    const req = makeRequest("/api/game/data/System.json", {
      headers: { "if-none-match": 'W/"etag-system-json"' },
      cookies: {
        ropoductions_age_verified: "true",
        ropoductions_session: validSignedCookie,
      },
    });
    const res = await GET(req, { params: Promise.resolve({ asset: ["data", "System.json"] }) });

    assert.equal(res.status, 304);
    assert.equal(res.headers.get("cache-control"), "private, max-age=86400");
    assert.equal(res.headers.get("vary"), "Cookie");
    assert.equal(res.headers.get("etag"), '"etag-system-json"');
    const text = await res.text();
    assert.equal(text, "");
  });

  it("returns 412 Precondition Failed when If-Match does not match", async () => {
    const req = makeRequest("/api/game/data/System.json", {
      headers: { "if-match": '"stale-etag"' },
      cookies: {
        ropoductions_age_verified: "true",
        ropoductions_session: validSignedCookie,
      },
    });
    const res = await GET(req, { params: Promise.resolve({ asset: ["data", "System.json"] }) });

    assert.equal(res.status, 412);
    assert.equal(res.headers.get("cache-control"), "no-store");
    const json = (await res.json()) as { error: { code: string; message: string } };
    assert.equal(json.error.code, "PRECONDITION_FAILED");
  });

  it("returns 404 Not Found JSON envelope for missing R2 asset", async () => {
    const req = makeRequest("/api/game/img/nonexistent.png", {
      cookies: {
        ropoductions_age_verified: "true",
        ropoductions_session: validSignedCookie,
      },
    });
    const res = await GET(req, { params: Promise.resolve({ asset: ["img", "nonexistent.png"] }) });

    assert.equal(res.status, 404);
    assert.equal(res.headers.get("cache-control"), "no-store");
    const json = (await res.json()) as { error: { code: string; message: string } };
    assert.equal(json.error.code, "NOT_FOUND");
  });

  it("rejects path traversal attempts with 400 Bad Request", async () => {
    const req = makeRequest("/api/game/data/..%2f..%2fsecret.json", {
      cookies: {
        ropoductions_age_verified: "true",
        ropoductions_session: validSignedCookie,
      },
    });
    const res = await GET(req, { params: Promise.resolve({ asset: ["data", "..", "secret.json"] }) });

    assert.equal(res.status, 400);
    assert.equal(res.headers.get("cache-control"), "no-store");
    const json = (await res.json()) as { error: { code: string; message: string } };
    assert.equal(json.error.code, "BAD_REQUEST");
  });

  it("rejects unallowed root directories with 400 Bad Request", async () => {
    const req = makeRequest("/api/game/config/database.json", {
      cookies: {
        ropoductions_age_verified: "true",
        ropoductions_session: validSignedCookie,
      },
    });
    const res = await GET(req, { params: Promise.resolve({ asset: ["config", "database.json"] }) });

    assert.equal(res.status, 400);
    const json = (await res.json()) as { error: { code: string; message: string } };
    assert.equal(json.error.code, "BAD_REQUEST");
  });

  it("rejects empty asset path with 400 Bad Request", async () => {
    const req = makeRequest("/api/game", {
      cookies: {
        ropoductions_age_verified: "true",
        ropoductions_session: validSignedCookie,
      },
    });
    const res = await GET(req, { params: Promise.resolve({ asset: [] }) });

    assert.equal(res.status, 400);
    const json = (await res.json()) as { error: { code: string; message: string } };
    assert.equal(json.error.code, "BAD_REQUEST");
  });

  it("handles HEAD requests with metadata headers and null body", async () => {
    const req = makeRequest("/api/game/data/System.json", {
      method: "HEAD",
      cookies: {
        ropoductions_age_verified: "true",
        ropoductions_session: validSignedCookie,
      },
    });
    const res = await HEAD(req, { params: Promise.resolve({ asset: ["data", "System.json"] }) });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-length"), sampleJson.length.toString());
    assert.equal(res.headers.get("content-type"), "application/json");
    assert.equal(res.headers.get("etag"), '"etag-system-json"');
    const text = await res.text();
    assert.equal(text, "");
  });

  it("burst session cache absorbs repeated calls within TTL", async () => {
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

    const burstCookie = await signValue("session-burst-test", TEST_SECRET);

    for (let i = 0; i < 5; i++) {
      const req = makeRequest("/api/game/data/System.json", {
        cookies: {
          ropoductions_age_verified: "true",
          ropoductions_session: burstCookie,
        },
      });
      const res = await GET(req, { params: Promise.resolve({ asset: ["data", "System.json"] }) });
      assert.equal(res.status, 200);
    }

    // Only the first call should query D1; subsequent calls hit in-isolate cache
    assert.equal(d1Queries, 1);
  });

  it("rejects encoded forward slashes in asset segments with 400 Bad Request", async () => {
    const req = makeRequest("/api/game/data/sub%2f..%2f..%2fsecret.json", {
      cookies: {
        ropoductions_age_verified: "true",
        ropoductions_session: validSignedCookie,
      },
    });
    const res = await GET(req, { params: Promise.resolve({ asset: ["data", "sub%2f..%2f..%2fsecret.json"] }) });

    assert.equal(res.status, 400);
    const json = (await res.json()) as { error: { code: string; message: string } };
    assert.equal(json.error.code, "BAD_REQUEST");
  });

  it("supports comma-separated ETags in If-None-Match header", async () => {
    const req = makeRequest("/api/game/data/System.json", {
      headers: { "if-none-match": '"other-etag", W/"etag-system-json"' },
      cookies: {
        ropoductions_age_verified: "true",
        ropoductions_session: validSignedCookie,
      },
    });
    const res = await GET(req, { params: Promise.resolve({ asset: ["data", "System.json"] }) });

    assert.equal(res.status, 304);
    assert.equal(res.headers.get("etag"), '"etag-system-json"');
  });

  it("supports comma-separated ETags in If-Match header", async () => {
    const req = makeRequest("/api/game/data/System.json", {
      headers: { "if-match": '"mismatched-etag", "etag-system-json"' },
      cookies: {
        ropoductions_age_verified: "true",
        ropoductions_session: validSignedCookie,
      },
    });
    const res = await GET(req, { params: Promise.resolve({ asset: ["data", "System.json"] }) });

    assert.equal(res.status, 200);
  });

  it("evaluates Range headers on HEAD requests and returns 206 with Content-Range", async () => {
    const req = makeRequest("/api/game/audio/bgm/Theme1.ogg", {
      method: "HEAD",
      headers: { range: "bytes=0-499" },
      cookies: {
        ropoductions_age_verified: "true",
        ropoductions_session: validSignedCookie,
      },
    });
    const res = await HEAD(req, { params: Promise.resolve({ asset: ["audio", "bgm", "Theme1.ogg"] }) });

    assert.equal(res.status, 206);
    assert.equal(res.headers.get("content-range"), "bytes 0-499/1000");
    assert.equal(res.headers.get("content-length"), "500");
    assert.equal(await res.text(), "");
  });

  it("returns 416 on HEAD requests with unsatisfiable Range header", async () => {
    const req = makeRequest("/api/game/audio/bgm/Theme1.ogg", {
      method: "HEAD",
      headers: { range: "bytes=999999-" },
      cookies: {
        ropoductions_age_verified: "true",
        ropoductions_session: validSignedCookie,
      },
    });
    const res = await HEAD(req, { params: Promise.resolve({ asset: ["audio", "bgm", "Theme1.ogg"] }) });

    assert.equal(res.status, 416);
    assert.equal(res.headers.get("content-range"), "bytes */1000");
    assert.equal(await res.text(), "");
  });
  it("filters redundant empty segments from adjacent slashes", async () => {
    const req = makeRequest("/api/game/audio//bgm/Theme1.ogg", {
      cookies: {
        ropoductions_age_verified: "true",
        ropoductions_session: validSignedCookie,
      },
    });
    const res = await GET(req, {
      params: Promise.resolve({ asset: ["audio", "", "bgm", "Theme1.ogg"] }),
    });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "audio/ogg");
  });

  it("normalizes capitalized root directory segments to match lowercase R2 keys", async () => {
    const req = makeRequest("/api/game/Audio/bgm/Theme1.ogg", {
      cookies: {
        ropoductions_age_verified: "true",
        ropoductions_session: validSignedCookie,
      },
    });
    const res = await GET(req, {
      params: Promise.resolve({ asset: ["Audio", "bgm", "Theme1.ogg"] }),
    });

    assert.equal(res.status, 200);
  });

  it("ignores inverted range headers where start > end and returns 200 full entity per RFC 9110", async () => {
    const req = makeRequest("/api/game/audio/bgm/Theme1.ogg", {
      headers: { range: "bytes=500-200" },
      cookies: {
        ropoductions_age_verified: "true",
        ropoductions_session: validSignedCookie,
      },
    });
    const res = await GET(req, {
      params: Promise.resolve({ asset: ["audio", "bgm", "Theme1.ogg"] }),
    });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-length"), "1000");
  });
});
