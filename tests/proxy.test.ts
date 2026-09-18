import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { proxy } from "../src/proxy";

function mockRequest(pathname: string, cookies: Record<string, string> = {}) {
  const nextUrl = new URL(pathname, "https://portal.test") as URL & { clone: () => URL };
  nextUrl.clone = () => new URL(nextUrl.toString());
  return {
    nextUrl,
    cookies: {
      get: (name: string) =>
        cookies[name] === undefined ? undefined : { value: cookies[name] },
    },
  };
}

const VERIFIED_PATRON = {
  ropoductions_session: "session-uuid",
  ropoductions_age_verified: "true",
};

describe("edge gate entry points", () => {
  it("blocks anonymous game asset requests with a 403 JSON envelope", async () => {
    const response = proxy(mockRequest("/api/game/data/file1.rpgsave") as never);

    assert.equal(response.status, 403);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), {
      error: {
        code: "UNAUTHORIZED",
        message: "Active patron session and 21+ age verification required.",
      },
    });
  });

  it("blocks game asset requests missing either credential", async () => {
    const noAge = proxy(
      mockRequest("/api/game/data/file1.rpgsave", { ropoductions_session: "session-uuid" }) as never
    );
    assert.equal(noAge.status, 403);

    const noSession = proxy(
      mockRequest("/api/game/data/file1.rpgsave", { ropoductions_age_verified: "true" }) as never
    );
    assert.equal(noSession.status, 403);
  });

  it("lets verified patrons stream game assets", async () => {
    const response = proxy(mockRequest("/api/game/data/file1.rpgsave", VERIFIED_PATRON) as never);
    assert.equal(response.status, 200);
  });

  it("lets verified patrons with quoted cookie values stream game assets", async () => {
    const quotedPatron = {
      ropoductions_session: '"session-uuid"',
      ropoductions_age_verified: '"true"',
    };
    const response = proxy(mockRequest("/api/game/data/file1.rpgsave", quotedPatron) as never);
    assert.equal(response.status, 200);
  });

  it("redirects unverified play entry to landing with a renewal flag", async () => {
    const response = proxy(mockRequest("/play") as never);

    assert.equal(response.status, 307);
    const location = new URL(response.headers.get("location")!);
    assert.equal(location.pathname, "/");
    assert.equal(location.searchParams.get("auth_required"), "true");
  });

  it("lets verified patrons enter play without redirect", async () => {
    const response = proxy(mockRequest("/play", VERIFIED_PATRON) as never);
    assert.equal(response.status, 200);
  });

  it("lets verified patrons with quoted cookie values enter play without redirect", async () => {
    const quotedPatron = {
      ropoductions_session: '"session-uuid"',
      ropoductions_age_verified: '"true"',
    };
    const response = proxy(mockRequest("/play", quotedPatron) as never);
    assert.equal(response.status, 200);
  });

  it("rejects false quoted age verification values", async () => {
    const invalidQuoted = {
      ropoductions_session: '"session-uuid"',
      ropoductions_age_verified: '"false"',
    };
    const response = proxy(mockRequest("/play", invalidQuoted) as never);
    assert.equal(response.status, 307);
  });

  it("passes unrelated portal traffic through untouched", async () => {
    const response = proxy(mockRequest("/") as never);
    assert.equal(response.status, 200);
  });

  it("passes /admin and /admin/* routes through without redirect for anti-enumeration evaluation", async () => {
    const unauthAdmin = proxy(mockRequest("/admin") as never);
    assert.equal(unauthAdmin.status, 200);
    assert.equal(unauthAdmin.headers.get("location"), null);

    const unauthSubroute = proxy(mockRequest("/admin/overrides") as never);
    assert.equal(unauthSubroute.status, 200);
    assert.equal(unauthSubroute.headers.get("location"), null);
  });
});
