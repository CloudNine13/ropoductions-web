import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  APPROVED_TIERS,
  findApprovedTier,
  isAccessAuthorized,
  MINIMUM_PLEDGE_CENTS,
} from "../src/lib/auth";
import {
  getPatronCampaignMembership,
  PATREON_CAMPAIGNS_URL,
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
});
