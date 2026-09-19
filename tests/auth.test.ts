import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  APPROVED_TIERS,
  findApprovedTier,
  isAccessAuthorized,
  issueSessionResponse,
  MINIMUM_PLEDGE_CENTS,
  validateSessionAccess,
} from "../src/lib/auth";
import { signValue, verifySignedValue } from "../src/lib/crypto";
import { SESSION_COOKIE_MAX_AGE } from "../src/lib/cookies";
import {
  getPatronCampaignMembership,
  PATREON_CAMPAIGNS_URL,
  resolveOAuthOriginContext,
} from "../src/lib/patreon";
import type { SessionRecord } from "../src/types/database";

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

describe("approved campaign tiers and threshold", () => {
  it("enforces minimum pledge threshold of 500 cents ($5.00)", () => {
    assert.equal(MINIMUM_PLEDGE_CENTS, 500);
  });

  it("registers the five approved campaign tiers with exact pledge cents", () => {
    assert.equal(APPROVED_TIERS.length, 5);
    const expected = [
      { name: "Ork Patron", cents: 500 },
      { name: "Ogre Pimp", cents: 1000 },
      { name: "Elf Sybarite", cents: 1500 },
      { name: "Horseman Aesthete", cents: 2500 },
      { name: "Mind Fucker Avatar", cents: 5000 },
    ];
    assert.deepEqual([...APPROVED_TIERS], expected);
  });

  it("resolves approved tiers by exact and case-insensitive name", () => {
    const tier = findApprovedTier("Ork Patron");
    assert.ok(tier);
    assert.equal(tier.name, "Ork Patron");
    assert.equal(tier.cents, 500);

    const lowercase = findApprovedTier("ork patron");
    assert.ok(lowercase);
    assert.equal(lowercase.name, "Ork Patron");

    const avatar = findApprovedTier("Mind Fucker Avatar");
    assert.ok(avatar);
    assert.equal(avatar.cents, 5000);

    const unknown = findApprovedTier("Goblin Peon");
    assert.equal(unknown, undefined);
  });

  it("rejects name matches when the pledge is below the tier minimum", () => {
    assert.equal(findApprovedTier("Ork Patron", 100), undefined);
    assert.ok(findApprovedTier("Ork Patron", 500));
    assert.ok(findApprovedTier("Ork Patron"));
  });

  it("falls back to amount-based match when a renamed tier reports sufficient pledge", () => {
    const tier = findApprovedTier("Mind Fucker Avatar", 500);
    assert.ok(tier);
    assert.equal(tier?.name, "Ork Patron");
  });

  it("resolves approved tiers by amount in cents", () => {
    const tier500 = findApprovedTier(null, 500);
    assert.ok(tier500);
    assert.equal(tier500.name, "Ork Patron");

    const tier1500 = findApprovedTier(null, 1500);
    assert.ok(tier1500);
    assert.equal(tier1500.name, "Elf Sybarite");

    const tier300 = findApprovedTier(null, 300);
    assert.equal(tier300, undefined);

    const tier1200 = findApprovedTier(null, 1200);
    assert.ok(tier1200);
    assert.equal(tier1200.name, "Ogre Pimp");

    const tier6000 = findApprovedTier(null, 6000);
    assert.ok(tier6000);
    assert.equal(tier6000.name, "Mind Fucker Avatar");
  });
});

describe("centralized access authorization policy isAccessAuthorized", () => {
  it("rejects null and undefined sessions", () => {
    assert.equal(isAccessAuthorized(null), false);
    assert.equal(isAccessAuthorized(undefined), false);
  });

  it("unconditionally authorizes admin override sessions regardless of pledge", () => {
    const adminSession = createSessionFixture({
      role: "admin",
      tier_id: "override_admin",
      tier_name: "Studio Admin",
      pledge_cents: 0,
      revoked: 0,
    });
    assert.equal(isAccessAuthorized(adminSession), true);
  });

  it("rejects revoked or expired admin and comp sessions", () => {
    const revokedAdmin = createSessionFixture({
      role: "admin",
      revoked: 1,
    });
    assert.equal(isAccessAuthorized(revokedAdmin), false);

    const expiredComp = createSessionFixture({
      role: "comp",
      expires_at_sec: Math.floor(Date.now() / 1000) - 100,
    });
    assert.equal(isAccessAuthorized(expiredComp), false);
  });

  it("authorizes valid comp override sessions", () => {
    const compSession = createSessionFixture({
      role: "comp",
      tier_id: "override_comp",
      tier_name: "Complimentary Pass",
      pledge_cents: 0,
      revoked: 0,
    });
    assert.equal(isAccessAuthorized(compSession), true);
  });

  it("authorizes active patrons meeting or exceeding the 500 cents threshold", () => {
    const patron500 = createSessionFixture({
      role: "patron",
      pledge_cents: 500,
    });
    assert.equal(isAccessAuthorized(patron500), true);

    const patron1000 = createSessionFixture({
      role: "patron",
      pledge_cents: 1000,
      tier_name: "Ogre Pimp",
    });
    assert.equal(isAccessAuthorized(patron1000), true);

    const patron5000 = createSessionFixture({
      role: "patron",
      pledge_cents: 5000,
      tier_name: "Mind Fucker Avatar",
    });
    assert.equal(isAccessAuthorized(patron5000), true);
  });

  it("rejects patron sessions with pledges below 500 cents", () => {
    const subThreshold = createSessionFixture({
      role: "patron",
      pledge_cents: 300,
    });
    assert.equal(isAccessAuthorized(subThreshold), false);

    const zeroPledge = createSessionFixture({
      role: "patron",
      pledge_cents: 0,
    });
    assert.equal(isAccessAuthorized(zeroPledge), false);
  });

  it("rejects revoked patron sessions", () => {
    const revokedPatron = createSessionFixture({
      role: "patron",
      pledge_cents: 500,
      revoked: 1,
    });
    assert.equal(isAccessAuthorized(revokedPatron), false);
  });

  it("rejects expired patron sessions", () => {
    const now = Math.floor(Date.now() / 1000);
    const expiredPatron = createSessionFixture({
      role: "patron",
      pledge_cents: 500,
      expires_at_sec: now - 60,
    });
    assert.equal(isAccessAuthorized(expiredPatron, now), false);

    const activePatron = createSessionFixture({
      role: "patron",
      pledge_cents: 500,
      expires_at_sec: now + 3600,
    });
    assert.equal(isAccessAuthorized(activePatron, now), true);
  });

  it("rejects sessions with unrecognized roles", () => {
    const unknownRole = createSessionFixture({
      role: "guest" as unknown as "patron",
    });
    assert.equal(isAccessAuthorized(unknownRole), false);
  });
});

describe("patreon campaign membership client getPatronCampaignMembership", () => {
  it("parses active campaign member and extracts entitled tier", async () => {
    const mockFetch: typeof fetch = async (input, init) => {
      const url = input.toString();
      assert.ok(url.startsWith(`${PATREON_CAMPAIGNS_URL}/camp_123/members`));
      assert.equal(
        init?.headers && (init.headers as Record<string, string>)["Authorization"],
        "Bearer test_token"
      );

      return new Response(
        JSON.stringify({
          data: [
            {
              id: "member_456",
              type: "member",
              attributes: {
                patron_status: "active_patron",
                currently_entitled_amount_cents: 500,
                email: "ork@example.com",
                full_name: "Ork Warrior",
              },
              relationships: {
                currently_entitled_tiers: {
                  data: [{ id: "tier_ork_1", type: "tier" }],
                },
              },
            },
          ],
          included: [
            {
              id: "tier_ork_1",
              type: "tier",
              attributes: {
                title: "Ork Patron",
                amount_cents: 500,
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const membership = await getPatronCampaignMembership(
      "camp_123",
      "test_token",
      mockFetch
    );

    assert.ok(membership);
    assert.equal(membership.memberId, "member_456");
    assert.equal(membership.patronStatus, "active_patron");
    assert.equal(membership.currentlyEntitledAmountCents, 500);
    assert.equal(membership.tierId, "tier_ork_1");
    assert.equal(membership.tierName, "Ork Patron");
  });

  it("selects the highest entitled tier when multiple tiers are included", async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          data: {
            id: "member_multi",
            type: "member",
            attributes: {
              patron_status: "active_patron",
              currently_entitled_amount_cents: 1500,
            },
            relationships: {
              currently_entitled_tiers: {
                data: [
                  { id: "tier_ork_1", type: "tier" },
                  { id: "tier_sybarite_3", type: "tier" },
                ],
              },
            },
          },
          included: [
            {
              id: "tier_ork_1",
              type: "tier",
              attributes: { title: "Ork Patron", amount_cents: 500 },
            },
            {
              id: "tier_sybarite_3",
              type: "tier",
              attributes: { title: "Elf Sybarite", amount_cents: 1500 },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const membership = await getPatronCampaignMembership({
      campaignId: "camp_123",
      accessToken: "test_token",
      fetchFn: mockFetch,
    });

    assert.ok(membership);
    assert.equal(membership.tierId, "tier_sybarite_3");
    assert.equal(membership.tierName, "Elf Sybarite");
    assert.equal(membership.currentlyEntitledAmountCents, 1500);
  });

  it("returns null when member data is empty", async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const membership = await getPatronCampaignMembership(
      "camp_123",
      "test_token",
      mockFetch
    );
    assert.equal(membership, null);
  });

  it("throws descriptive error when Patreon API returns non-200 status", async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response("Unauthorized campaign access", { status: 401 });
    };

    await assert.rejects(
      () => getPatronCampaignMembership("camp_123", "bad_token", mockFetch),
      /status 401: Unauthorized campaign access/
    );
  });

  it("resolves the correct member by patronId when multiple members are returned", async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "member_other",
              type: "member",
              attributes: {
                patron_status: "former_patron",
                currently_entitled_amount_cents: 0,
              },
              relationships: {
                user: { data: { id: "user_other", type: "user" } },
              },
            },
            {
              id: "member_target",
              type: "member",
              attributes: {
                patron_status: "active_patron",
                currently_entitled_amount_cents: 2500,
              },
              relationships: {
                user: { data: { id: "user_target", type: "user" } },
                currently_entitled_tiers: {
                  data: [{ id: "tier_horseman", type: "tier" }],
                },
              },
            },
          ],
          included: [
            null,
            {
              id: "tier_horseman",
              type: "tier",
              attributes: { title: "Horseman Aesthete", amount_cents: 2500 },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const membership = await getPatronCampaignMembership({
      campaignId: "camp_123",
      accessToken: "test_token",
      patronId: "user_target",
      fetchFn: mockFetch,
    });

    assert.ok(membership);
    assert.equal(membership.memberId, "member_target");
    assert.equal(membership.patronStatus, "active_patron");
    assert.equal(membership.tierName, "Horseman Aesthete");
    assert.equal(membership.currentlyEntitledAmountCents, 2500);
  });

  it("gracefully falls back to tier reference ID when included array is missing", async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          data: {
            id: "member_solo",
            type: "member",
            attributes: {
              patron_status: "active_patron",
              currently_entitled_amount_cents: 500,
            },
            relationships: {
              currently_entitled_tiers: {
                data: [{ id: "tier_standalone_500", type: "tier" }],
              },
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const membership = await getPatronCampaignMembership({
      campaignId: "camp_123",
      accessToken: "test_token",
      fetchFn: mockFetch,
    });

    assert.ok(membership);
    assert.equal(membership.tierId, "tier_standalone_500");
  });

  it("returns null when the campaign member identity does not match", async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "member_other",
              type: "member",
              attributes: {
                patron_status: "active_patron",
                currently_entitled_amount_cents: 2500,
              },
              relationships: {
                user: { data: { id: "user_other", type: "user" } },
              },
            },
            {
              id: "member_another",
              type: "member",
              attributes: {
                patron_status: "active_patron",
                currently_entitled_amount_cents: 500,
              },
              relationships: {
                user: { data: { id: "user_another", type: "user" } },
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const membership = await getPatronCampaignMembership({
      campaignId: "camp_123",
      accessToken: "test_token",
      patronId: "user_self",
      fetchFn: mockFetch,
    });

    assert.equal(membership, null);
  });

  it("rejects a lone campaign member whose user linkage does not match", async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "member_solo",
              type: "member",
              attributes: {
                patron_status: "active_patron",
                currently_entitled_amount_cents: 500,
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const membership = await getPatronCampaignMembership({
      campaignId: "camp_123",
      accessToken: "test_token",
      patronId: "user_self",
      fetchFn: mockFetch,
    });

    assert.equal(membership, null);
  });
  it("falls back to identity memberships endpoint when creator campaign endpoint returns 403", async () => {
    const mockFetch: typeof fetch = async (input) => {
      const url = input.toString();
      if (url.includes("/campaigns/camp_123/members")) {
        return new Response("Forbidden", { status: 403 });
      }

      assert.ok(url.includes("/api/oauth2/v2/identity"));
      assert.ok(url.includes("memberships.campaign"));

      return new Response(
        JSON.stringify({
          data: {
            id: "user_patron_1",
            type: "user",
          },
          included: [
            {
              id: "mem_from_identity",
              type: "member",
              attributes: {
                patron_status: "active_patron",
                currently_entitled_amount_cents: 1000,
                email: "patron@example.com",
              },
              relationships: {
                campaign: {
                  data: { id: "camp_123", type: "campaign" },
                },
                currently_entitled_tiers: {
                  data: [{ id: "tier_ogre", type: "tier" }],
                },
              },
            },
            {
              id: "tier_ogre",
              type: "tier",
              attributes: {
                title: "Ogre Pimp",
                amount_cents: 1000,
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const membership = await getPatronCampaignMembership({
      campaignId: "camp_123",
      accessToken: "patron_oauth_token",
      fetchFn: mockFetch,
    });

    assert.ok(membership);
    assert.equal(membership.memberId, "mem_from_identity");
    assert.equal(membership.patronStatus, "active_patron");
    assert.equal(membership.currentlyEntitledAmountCents, 1000);
    assert.equal(membership.tierName, "Ogre Pimp");
  });
});

describe("session access validation and transactional override revocation validateSessionAccess", () => {
  const SECRET = "test-session-secret-32-chars-long!";
  const NOW = 1750000000;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- override fixtures are partial D1 rows
  function createTestDb(initialSessions: SessionRecord[] = [], initialOverrides: any[] = []) {
    const sessions = new Map<string, SessionRecord>(initialSessions.map((s) => [s.id, { ...s }]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- override rows are keyed by patron_id
    const overrides = new Map<string, any>(initialOverrides.map((o) => [o.patron_id, { ...o }]));

    return {
      sessions,
      overrides,
      db: {
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
                return (overrides.get(stmt.params[0] as string) as T | undefined) ?? null;
              }
              throw new Error(`Unhandled query: ${sql}`);
            },
            async run(): Promise<D1Response> {
              if (sql.includes("UPDATE sessions SET revoked = 1 WHERE id = ?")) {
                const s = sessions.get(stmt.params[0] as string);
                if (s) {
                  s.revoked = 1;
                }
                return { success: true, meta: {} } as D1Response;
              }
              throw new Error(`Unhandled run query: ${sql}`);
            },
          };
          return stmt;
        },
      } as unknown as D1Database,
    };
  }

  it("returns not_found when sessionCookie is missing or empty", async () => {
    const { db } = createTestDb();
    const res = await validateSessionAccess({ db, sessionCookie: null });
    assert.equal(res.status, "not_found");
  });

  it("returns invalid_signature when session cookie HMAC signature is tampered", async () => {
    const { db } = createTestDb();
    const signed = await signValue("session-1", SECRET);
    const tampered = signed.slice(0, -4) + "XXXX";
    const res = await validateSessionAccess({ db, sessionCookie: tampered, sessionSecret: SECRET });
    assert.equal(res.status, "invalid_signature");
  });

  it("fails closed with invalid_signature when the session secret is missing", async () => {
    const { db } = createTestDb([createSessionFixture({ id: "sess-live" })]);
    const signed = await signValue("sess-live", SECRET);
    const res = await validateSessionAccess({ db, sessionCookie: signed });
    assert.equal(res.status, "invalid_signature");
  });

  it("returns not_found when session does not exist in D1", async () => {
    const { db } = createTestDb();
    const signed = await signValue("non-existent", SECRET);
    const res = await validateSessionAccess({ db, sessionCookie: signed, sessionSecret: SECRET });
    assert.equal(res.status, "not_found");
  });

  it("authorizes active patron with pledge >= 500 cents", async () => {
    const session = createSessionFixture({ id: "sess-patron-1", pledge_cents: 500, expires_at_sec: NOW + 3600 });
    const { db } = createTestDb([session]);
    const signed = await signValue(session.id, SECRET);
    const res = await validateSessionAccess({ db, sessionCookie: signed, sessionSecret: SECRET, nowSec: NOW });
    assert.equal(res.status, "authorized");
    if (res.status === "authorized") {
      assert.equal(res.session.id, "sess-patron-1");
    }
  });

  it("rejects patron with pledge below 500 cents as unauthorized", async () => {
    const session = createSessionFixture({ id: "sess-patron-low", pledge_cents: 400, expires_at_sec: NOW + 3600 });
    const { db } = createTestDb([session]);
    const signed = await signValue(session.id, SECRET);
    const res = await validateSessionAccess({ db, sessionCookie: signed, sessionSecret: SECRET, nowSec: NOW });
    assert.equal(res.status, "unauthorized");
  });

  it("returns lapsed for expired patron session", async () => {
    const session = createSessionFixture({ id: "sess-patron-exp", expires_at_sec: NOW - 10 });
    const { db } = createTestDb([session]);
    const signed = await signValue(session.id, SECRET);
    const res = await validateSessionAccess({ db, sessionCookie: signed, sessionSecret: SECRET, nowSec: NOW });
    assert.equal(res.status, "lapsed");
  });

  it("returns revoked for previously revoked session", async () => {
    const session = createSessionFixture({ id: "sess-revoked", revoked: 1, expires_at_sec: NOW + 3600 });
    const { db } = createTestDb([session]);
    const signed = await signValue(session.id, SECRET);
    const res = await validateSessionAccess({ db, sessionCookie: signed, sessionSecret: SECRET, nowSec: NOW });
    assert.equal(res.status, "revoked");
  });

  it("authorizes active admin with existing patron_override", async () => {
    const session = createSessionFixture({ id: "sess-admin", role: "admin", patron_id: "admin-user", expires_at_sec: NOW + 3600 });
    const override = { patron_id: "admin-user", role: "admin" };
    const { db } = createTestDb([session], [override]);
    const signed = await signValue(session.id, SECRET);
    const res = await validateSessionAccess({ db, sessionCookie: signed, sessionSecret: SECRET, nowSec: NOW });
    assert.equal(res.status, "authorized");
  });

  it("authorizes active comp with existing patron_override", async () => {
    const session = createSessionFixture({ id: "sess-comp", role: "comp", patron_id: "comp-user", expires_at_sec: NOW + 3600 });
    const override = { patron_id: "comp-user", role: "comp" };
    const { db } = createTestDb([session], [override]);
    const signed = await signValue(session.id, SECRET);
    const res = await validateSessionAccess({ db, sessionCookie: signed, sessionSecret: SECRET, nowSec: NOW });
    assert.equal(res.status, "authorized");
  });

  it("transactionally revokes admin session when patron_override is deleted", async () => {
    const session = createSessionFixture({ id: "sess-admin-deleted", role: "admin", patron_id: "admin-deleted", expires_at_sec: NOW + 3600 });
    const { db, sessions } = createTestDb([session], []);
    const signed = await signValue(session.id, SECRET);
    const res = await validateSessionAccess({ db, sessionCookie: signed, sessionSecret: SECRET, nowSec: NOW });
    assert.equal(res.status, "override_deleted");
    assert.equal(sessions.get("sess-admin-deleted")?.revoked, 1);
  });

  it("transactionally revokes comp session when patron_override is deleted", async () => {
    const session = createSessionFixture({ id: "sess-comp-deleted", role: "comp", patron_id: "comp-deleted", expires_at_sec: NOW + 3600 });
    const { db, sessions } = createTestDb([session], []);
    const signed = await signValue(session.id, SECRET);
    const res = await validateSessionAccess({ db, sessionCookie: signed, sessionSecret: SECRET, nowSec: NOW });
    assert.equal(res.status, "override_deleted");
    assert.equal(sessions.get("sess-comp-deleted")?.revoked, 1);
  });
});

describe("resolveOAuthOriginContext origin normalization and mismatch detection", () => {
  it("detects origin mismatch and normalizes 127.0.0.1 loopback to localhost", () => {
    const req = new Request("http://127.0.0.1:3000/api/auth/patreon", {
      headers: { Host: "127.0.0.1:3000" },
    });
    const ctx = resolveOAuthOriginContext(req);
    assert.equal(ctx.clientOrigin, "http://127.0.0.1:3000");
    assert.equal(ctx.redirectOrigin, "http://localhost:3000");
    assert.equal(ctx.redirectUri, "http://localhost:3000/api/auth/callback");
    assert.equal(ctx.isOriginMismatch, true);
  });

  it("reports no mismatch when client requests on localhost", () => {
    const req = new Request("http://localhost:3000/api/auth/patreon", {
      headers: { Host: "localhost:3000" },
    });
    const ctx = resolveOAuthOriginContext(req);
    assert.equal(ctx.clientOrigin, "http://localhost:3000");
    assert.equal(ctx.redirectOrigin, "http://localhost:3000");
    assert.equal(ctx.isOriginMismatch, false);
  });

  it("preserves custom dev port on loopback addresses", () => {
    const req = new Request("http://127.0.0.1:8787/api/auth/patreon", {
      headers: { Host: "127.0.0.1:8787" },
    });
    const ctx = resolveOAuthOriginContext(req);
    assert.equal(ctx.clientOrigin, "http://127.0.0.1:8787");
    assert.equal(ctx.redirectOrigin, "http://localhost:8787");
    assert.equal(ctx.redirectUri, "http://localhost:8787/api/auth/callback");
    assert.equal(ctx.isOriginMismatch, true);
  });

  it("handles IPv6 loopback [::1] with port preservation", () => {
    const req = new Request("http://[::1]:3001/api/auth/patreon", {
      headers: { Host: "[::1]:3001" },
    });
    const ctx = resolveOAuthOriginContext(req);
    assert.equal(ctx.clientOrigin, "http://[::1]:3001");
    assert.equal(ctx.redirectOrigin, "http://localhost:3001");
    assert.equal(ctx.isOriginMismatch, true);
  });

  it("does not treat subdomain spoofs as loopback", () => {
    const req = new Request("http://localhost.evil.com:3000/api/auth/patreon", {
      headers: { Host: "localhost.evil.com:3000" },
    });
    assert.throws(() => resolveOAuthOriginContext(req), /PATREON_REDIRECT_URI/);
  });

  it("refuses to derive redirect_uri from forwarding headers without configuration", () => {
    const req = new Request("http://ropoductions.com/api/auth/patreon", {
      headers: {
        Host: "ropoductions.com",
        "x-forwarded-host": "evil.example",
      },
    });
    assert.throws(() => resolveOAuthOriginContext(req), /PATREON_REDIRECT_URI/);
  });

  it("parses first proto from multi-value x-forwarded-proto header", () => {
    const req = new Request("http://ropoductions.com/api/auth/patreon", {
      headers: {
        Host: "ropoductions.com",
        "x-forwarded-proto": "https, http",
      },
    });
    const ctx = resolveOAuthOriginContext(req, "https://ropoductions.com/api/auth/callback");
    assert.equal(ctx.clientOrigin, "https://ropoductions.com");
    assert.equal(ctx.redirectOrigin, "https://ropoductions.com");
    assert.equal(ctx.isOriginMismatch, false);
  });

  it("safely recovers from malformed configured redirect URI without throwing", () => {
    const req = new Request("http://localhost:3000/api/auth/patreon", {
      headers: { Host: "localhost:3000" },
    });
    const ctx = resolveOAuthOriginContext(req, "not a valid uri :::");
    assert.equal(ctx.redirectOrigin, "http://localhost:3000");
    assert.equal(ctx.redirectUri, "http://localhost:3000/api/auth/callback");
  });
});

describe("issueSessionResponse unified session issuance helper", () => {
  function createTestDb() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- session rows carry constraint alias keys
    const sessions = new Map<string, any>();
    const db = {
      prepare(sql: string) {
        const stmt = {
          params: [] as unknown[],
          bind(...params: unknown[]) {
            stmt.params = params;
            return stmt;
          },
          async run() {
            if (sql.includes("INSERT INTO sessions")) {
              assert.equal(
                stmt.params.length,
                16,
                "upsertSession must bind exactly 16 parameters (14 columns + 2 conflict guards)"
              );
              const [
                id,
                patron_id,
                email,
                role,
                tier_id,
                tier_name,
                pledge_cents,
                encrypted_access_token,
                encrypted_refresh_token,
                token_expires_at_sec,
                expires_at_sec,
                revoked,
                created_at_sec,
                last_verified_at_sec,
                guard_role,
                guard_revoked,
              ] = stmt.params;
              sessions.set(id as string, {
                id,
                patron_id,
                email,
                role,
                tier_id,
                tier_name,
                pledge_cents,
                encrypted_access_token,
                encrypted_refresh_token,
                token_expires_at_sec,
                expires_at_sec,
                revoked,
                created_at_sec,
                last_verified_at_sec,
                guard_role,
                guard_revoked,
              });
              return { success: true, meta: {} };
            }
            throw new Error(`Unhandled run SQL: ${sql}`);
          },
        };
        return stmt;
      },
    } as unknown as D1Database;
    return { db, sessions };
  }

  it("creates session in D1 with 16 bound parameters and returns 302 response to /play", async () => {
    const { db, sessions } = createTestDb();
    const secret = "test-secret-min-32-chars-for-hmac-sha256-signing!!";
    const nowSec = 1700000000;

    const response = await issueSessionResponse({
      db,
      sessionSecret: secret,
      patronId: "patron-999",
      email: "user@example.com",
      role: "patron",
      tierId: "tier_500",
      tierName: "Ork Patron",
      pledgeCents: 500,
      encryptedAccessToken: "enc-access",
      encryptedRefreshToken: "enc-refresh",
      tokenExpiresAtSec: nowSec + 3600,
      sessionExpiresAtSec: nowSec + SESSION_COOKIE_MAX_AGE,
      nowSec,
      isSecure: true,
      clearCookieHeader: "ropoductions_oauth_verifier=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax",
    });

    assert.equal(response.status, 302);
    assert.equal(response.headers.get("Location"), "/play");
    assert.equal(response.headers.get("Cache-Control"), "no-store, max-age=0");

    const setCookies = response.headers.getSetCookie();
    assert.equal(setCookies.length, 2);
    assert.ok(setCookies[0].includes("ropoductions_oauth_verifier="));
    assert.ok(setCookies[1].includes("ropoductions_session="));
    assert.ok(setCookies[1].includes("Secure"));
    assert.ok(setCookies[1].includes("HttpOnly"));
    assert.ok(setCookies[1].includes("SameSite=Lax"));
    assert.ok(setCookies[1].includes("Path=/"));
    assert.ok(setCookies[1].includes(`Max-Age=${SESSION_COOKIE_MAX_AGE}`));

    assert.equal(sessions.size, 1);
    const [savedSession] = sessions.values();
    assert.equal(savedSession.patron_id, "patron-999");
    assert.equal(savedSession.email, "user@example.com");
    assert.equal(savedSession.role, "patron");
    assert.equal(savedSession.tier_id, "tier_500");
    assert.equal(savedSession.tier_name, "Ork Patron");
    assert.equal(savedSession.pledge_cents, 500);
    assert.equal(savedSession.encrypted_access_token, "enc-access");
    assert.equal(savedSession.encrypted_refresh_token, "enc-refresh");
    assert.equal(savedSession.token_expires_at_sec, nowSec + 3600);
    assert.equal(savedSession.expires_at_sec, nowSec + SESSION_COOKIE_MAX_AGE);
    assert.equal(savedSession.revoked, 0);
    assert.equal(savedSession.created_at_sec, nowSec);
    assert.equal(savedSession.last_verified_at_sec, nowSec);
    assert.equal(savedSession.guard_role, "patron");
    assert.equal(savedSession.guard_revoked, 0);

    const rawCookieVal = setCookies[1].split(";")[0].replace("ropoductions_session=", "");
    const verifiedId = await verifySignedValue(rawCookieVal, secret);
    assert.equal(verifiedId, savedSession.id);
  });

  it("redirects to server_configuration_error and writes no D1 session on missing or empty secret", async () => {
    const { db, sessions } = createTestDb();
    const clearCookieHeader = "ropoductions_oauth_verifier=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax";

    const emptySecrets = ["", "   ", "\t\n"];
    for (const secret of emptySecrets) {
      const response = await issueSessionResponse({
        db,
        sessionSecret: secret,
        patronId: "patron-no-secret",
        role: "patron",
        tierId: "tier_500",
        tierName: "Ork Patron",
        pledgeCents: 500,
        encryptedAccessToken: "enc-access",
        encryptedRefreshToken: "enc-refresh",
        tokenExpiresAtSec: 1800000000,
        sessionExpiresAtSec: 1800000000,
        clearCookieHeader,
      });

      assert.equal(response.status, 302);
      assert.equal(response.headers.get("Location"), "/?auth_error=server_configuration_error");
      assert.equal(response.headers.get("Cache-Control"), "no-store, max-age=0");
      const setCookies = response.headers.getSetCookie();
      assert.equal(setCookies.length, 1);
      assert.ok(setCookies[0].includes("ropoductions_oauth_verifier="));
    }

    assert.equal(sessions.size, 0, "No D1 session record should be written when secret is invalid");
  });

  it("handles comp and admin roles, omitted email, and default timestamps and security flag", async () => {
    const { db, sessions } = createTestDb();
    const secret = "test-secret-min-32-chars-for-hmac-sha256-signing!!";
    const beforeSec = Math.floor(Date.now() / 1000);

    const responseComp = await issueSessionResponse({
      db,
      sessionSecret: secret,
      patronId: "comp-111",
      role: "comp",
      tierId: "override_comp",
      tierName: "Complimentary Pass",
      pledgeCents: 0,
      encryptedAccessToken: "enc-comp-access",
      encryptedRefreshToken: "enc-comp-refresh",
      tokenExpiresAtSec: 1800000000,
      sessionExpiresAtSec: 1800000000,
      clearCookieHeader: "ropoductions_oauth_verifier=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax",
    });

    assert.equal(responseComp.status, 302);
    assert.equal(responseComp.headers.get("Location"), "/play");

    const compCookies = responseComp.headers.getSetCookie();
    assert.equal(compCookies.length, 2);
    assert.ok(compCookies[1].includes("Secure"), "isSecure should default to true when omitted");

    const compSession = Array.from(sessions.values()).find((s) => s.patron_id === "comp-111");
    assert.ok(compSession);
    assert.equal(compSession.role, "comp");
    assert.equal(compSession.email, null, "Omitted email should default to null");
    assert.equal(compSession.guard_role, "comp");
    assert.ok(compSession.created_at_sec >= beforeSec);
    assert.ok(compSession.last_verified_at_sec >= beforeSec);

    const responseAdminInsecure = await issueSessionResponse({
      db,
      sessionSecret: secret,
      patronId: "admin-222",
      email: null,
      role: "admin",
      tierId: "override_admin",
      tierName: "Studio Admin",
      pledgeCents: 0,
      encryptedAccessToken: "enc-admin-access",
      encryptedRefreshToken: "enc-admin-refresh",
      tokenExpiresAtSec: 1800000000,
      sessionExpiresAtSec: 1800000000,
      isSecure: false,
      clearCookieHeader: "ropoductions_oauth_verifier=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax",
    });

    assert.equal(responseAdminInsecure.status, 302);
    assert.equal(responseAdminInsecure.headers.get("Location"), "/play");

    const adminCookies = responseAdminInsecure.headers.getSetCookie();
    assert.equal(adminCookies.length, 2);
    assert.equal(adminCookies[1].includes("Secure"), false, "Explicit isSecure: false should omit Secure attribute");

    const adminSession = Array.from(sessions.values()).find((s) => s.patron_id === "admin-222");
    assert.ok(adminSession);
    assert.equal(adminSession.role, "admin");
    assert.equal(adminSession.guard_role, "admin");
  });
});
