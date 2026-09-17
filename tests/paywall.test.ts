import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getPaywallBannerMessageKey,
  mapSessionStatusToPaywall,
  mapSessionStatusToPlayRedirect,
  PATREON_LOGIN_HREF,
  PAYWALL_CAMPAIGN_URL,
  PAYWALL_TIERS,
  resolvePaywallType,
  SESSION_CLEAR_HREF,
  sessionClearHref,
} from "../src/lib/paywall";
import { GET as clearSession } from "../src/app/api/auth/session/route";
import { SESSION_COOKIE_NAME } from "../src/lib/cookies";

const testsDir = dirname(fileURLToPath(import.meta.url));
const enPaywall = JSON.parse(
  readFileSync(join(testsDir, "../src/locales/en.json"), "utf8")
).paywall as Record<string, string>;

describe("portal query-to-paywall mapping resolvePaywallType", () => {
  it("maps paywall=revoked, lapsed, and required", () => {
    assert.equal(resolvePaywallType({ paywall: "revoked" }), "revoked");
    assert.equal(resolvePaywallType({ paywall: "lapsed" }), "lapsed");
    assert.equal(resolvePaywallType({ paywall: "required" }), "required");
  });

  it("collapses auth_required=true onto required", () => {
    assert.equal(resolvePaywallType({ auth_required: "true" }), "required");
  });

  it("renders no interstitial for absent or unknown params", () => {
    assert.equal(resolvePaywallType({}), null);
    assert.equal(resolvePaywallType({ paywall: "expired" }), null);
    assert.equal(resolvePaywallType({ auth_required: "false" }), null);
  });
});

describe("play status-to-redirect mapping mapSessionStatusToPlayRedirect", () => {
  it("renders the game for authorized sessions", () => {
    assert.equal(mapSessionStatusToPlayRedirect("authorized"), null);
  });

  it("sends tampered and missing sessions to the required paywall", () => {
    assert.equal(mapSessionStatusToPlayRedirect("invalid_signature"), "/?paywall=required");
    assert.equal(mapSessionStatusToPlayRedirect("not_found"), "/?paywall=required");
  });

  it("sends revoked and deleted-override sessions to the revoked paywall", () => {
    assert.equal(mapSessionStatusToPlayRedirect("override_deleted"), "/?paywall=revoked");
    assert.equal(mapSessionStatusToPlayRedirect("revoked"), "/?paywall=revoked");
  });

  it("sends lapsed and under-pledged sessions to the lapsed paywall", () => {
    assert.equal(mapSessionStatusToPlayRedirect("lapsed"), "/?paywall=lapsed");
    assert.equal(mapSessionStatusToPlayRedirect("unauthorized"), "/?paywall=lapsed");
  });
});

describe("session clearing bounce sessionClearHref", () => {
  it("routes every non-authorized status through the clearing endpoint", () => {
    assert.equal(SESSION_CLEAR_HREF, "/api/auth/session");
    for (const status of [
      "invalid_signature",
      "not_found",
      "override_deleted",
      "revoked",
      "lapsed",
      "unauthorized",
    ] as const) {
      const paywall = mapSessionStatusToPaywall(status);
      assert.ok(paywall, `missing paywall mapping for ${status}`);
      assert.equal(
        sessionClearHref(paywall!),
        `/api/auth/session?paywall=${paywall}`
      );
    }
    assert.equal(mapSessionStatusToPaywall("authorized"), null);
  });
});

describe("session clearing route GET /api/auth/session", () => {
  it("clears the session cookie and lands on the requested paywall", async () => {
    const res = await clearSession(
      new Request("http://127.0.0.1:3100/api/auth/session?paywall=revoked")
    );
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("Location"), "/?paywall=revoked");
    const setCookie = res.headers.get("Set-Cookie") ?? "";
    assert.ok(setCookie.startsWith(`${SESSION_COOKIE_NAME}=`));
    assert.ok(setCookie.includes("max-age=0"));
    assert.ok(setCookie.includes("path=/"));
    assert.ok(setCookie.includes("HttpOnly"));
    assert.ok(setCookie.includes("SameSite=Lax"));
    assert.equal(res.headers.get("Cache-Control"), "no-store, max-age=0");
  });

  it("falls back to the required paywall for unknown values", async () => {
    const res = await clearSession(
      new Request("http://127.0.0.1:3100/api/auth/session?paywall=expired")
    );
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("Location"), "/?paywall=required");
  });
});

describe("paywall banner copy getPaywallBannerMessageKey", () => {
  it("selects a distinct non-empty message per paywall type", () => {
    const keys = [
      getPaywallBannerMessageKey("revoked"),
      getPaywallBannerMessageKey("lapsed"),
      getPaywallBannerMessageKey("required"),
    ];
    assert.deepEqual(keys, ["bannerRevoked", "bannerLapsed", "bannerAuthRequired"]);
    for (const key of keys) {
      assert.ok(enPaywall[key]?.length > 0, `missing paywall copy for ${key}`);
    }
  });
});

describe("paywall tier matrix and CTAs", () => {
  it("lists the five supporter tiers with exact prices", () => {
    assert.equal(PAYWALL_TIERS.length, 5);
    assert.deepEqual(
      PAYWALL_TIERS.map((t) => t.price),
      ["$5", "$10", "$15", "$25", "$50"]
    );
  });

  it("resolves every tier name and description against the en locale", () => {
    for (const tier of PAYWALL_TIERS) {
      assert.ok(enPaywall[tier.nameKey]?.length > 0, `missing copy for ${tier.nameKey}`);
      assert.ok(enPaywall[tier.descKey]?.length > 0, `missing copy for ${tier.descKey}`);
    }
  });

  it("points login at the Patreon auth route and pledge at the campaign", () => {
    assert.equal(PATREON_LOGIN_HREF, "/api/auth/patreon");
    assert.equal(PAYWALL_CAMPAIGN_URL, "https://www.patreon.com/join/Ropoductions");
  });
});
