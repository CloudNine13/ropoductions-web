import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AGE_VERIFIED_COOKIE_MAX_AGE,
  AGE_VERIFIED_COOKIE_NAME,
  OAUTH_VERIFIER_COOKIE_MAX_AGE,
  OAUTH_VERIFIER_COOKIE_NAME,
  SESSION_COOKIE_MAX_AGE,
  SESSION_COOKIE_NAME,
  parseCookies,
  serializeCookie,
} from "../src/lib/cookies";
import { buildPatreonAuthorizeUrl, PATREON_AUTHORIZE_URL } from "../src/lib/patreon";
import { config as edgeConfig, proxy } from "../src/proxy";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (rel: string): string => readFileSync(join(rootDir, rel), "utf8");

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

describe("portal base contract", () => {
  it("keeps the 21+ age gate cookie on its implemented identity and lifetime", () => {
    assert.equal(AGE_VERIFIED_COOKIE_NAME, "ropoductions_age_verified");
    assert.equal(AGE_VERIFIED_COOKIE_MAX_AGE, 14 * 60 * 60);
  });

  it("keeps the opaque patron session cookie on its identity and 30-day lifetime", () => {
    assert.equal(SESSION_COOKIE_NAME, "ropoductions_session");
    assert.equal(SESSION_COOKIE_MAX_AGE, 30 * 24 * 60 * 60);

    const serialized = serializeCookie(SESSION_COOKIE_NAME, "session-uuid", {
      maxAge: SESSION_COOKIE_MAX_AGE,
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    });
    assert.ok(serialized.includes("HttpOnly"));
    assert.ok(serialized.includes("Secure"));
    assert.ok(serialized.includes("SameSite=Lax"));
    assert.ok(serialized.includes("Path=/"));
    assert.ok(serialized.includes(`Max-Age=${SESSION_COOKIE_MAX_AGE}`));
  });

  it("keeps the OAuth verifier cookie short-lived at ten minutes", () => {
    assert.equal(OAUTH_VERIFIER_COOKIE_NAME, "ropoductions_oauth_verifier");
    assert.equal(OAUTH_VERIFIER_COOKIE_MAX_AGE, 10 * 60);
  });

  it("round-trips cookie values through serialize and parse without loss", () => {
    const serialized = serializeCookie("probe", "a b+c/d=e", { maxAge: 60 });
    assert.equal(parseCookies(serialized)["probe"], "a b+c/d=e");
  });

  it("freezes the anonymous asset rejection to the 403 JSON envelope", async () => {
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

  it("keeps /play redirecting to landing with the renewal flag", async () => {
    const response = proxy(mockRequest("/play") as never);

    assert.equal(response.status, 307);
    const location = new URL(response.headers.get("location")!);
    assert.equal(location.pathname, "/");
    assert.equal(location.searchParams.get("auth_required"), "true");
  });

  it("keeps the edge matcher pinned to play and game asset routes", () => {
    assert.deepEqual(edgeConfig.matcher, ["/play/:path*", "/api/game/:path*"]);
  });

  it("keeps the Patreon authorize URL on PKCE S256 with the identity scopes", () => {
    const url = new URL(
      buildPatreonAuthorizeUrl({
        clientId: "client_abc",
        redirectUri: "http://localhost:3000/api/auth/callback",
        state: "random_state",
        codeChallenge: "challenge_xyz",
      })
    );

    assert.equal(`${url.origin}${url.pathname}`, PATREON_AUTHORIZE_URL);
    assert.equal(url.searchParams.get("response_type"), "code");
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    assert.equal(
      url.searchParams.get("scope"),
      "identity identity[email] identity.memberships campaigns.members"
    );
  });

  it("keeps the auth entry points mounted", () => {
    assert.ok(existsSync(join(rootDir, "src/app/api/auth/patreon/route.ts")));
    assert.ok(existsSync(join(rootDir, "src/app/api/auth/callback/route.ts")));
  });

  it("keeps the age-gate exit pointed at the configured redirect target", () => {
    assert.ok(readSource("src/components/age-gate-dialog.tsx").includes("https://google.com"));
  });

  it("keeps the edge security headers that the portal E2E depends on", () => {
    const nextConfig = readSource("next.config.ts");
    for (const header of [
      "nosniff",
      "SAMEORIGIN",
      "frame-ancestors 'self'",
      "Strict-Transport-Security",
      "frame-src 'self'",
    ]) {
      assert.ok(nextConfig.includes(header), `next.config.ts dropped ${header}`);
    }
  });

  it("keeps the private Cloudflare bindings for D1 sessions and game assets", () => {
    const wrangler = readSource("wrangler.toml");
    assert.ok(wrangler.includes('binding = "DB"'));
    assert.ok(wrangler.includes('binding = "GAME_ASSETS"'));
    assert.ok(wrangler.includes('migrations_dir = "migrations"'));
  });

  it("keeps D1 access on bound parameters with static SQL text", () => {
    const db = readSource("src/lib/db.ts");
    const prepares = db.match(/\.prepare\(/g) ?? [];
    const binds = db.match(/\.bind\(/g) ?? [];
    assert.ok(prepares.length > 0);
    assert.equal(binds.length, prepares.length);
    assert.ok(!/prepare\(\s*`[^`]*\$\{/.test(db));
    assert.ok(!/prepare\([^)]*\+/.test(db));
  });

  it("integrates AuthErrorToast into the portal landing page for auth error parameter feedback", () => {
    const portalPage = readSource("src/app/(portal)/page.tsx");
    assert.ok(portalPage.includes("AuthErrorToast"), "Portal page must import and render AuthErrorToast");
    assert.ok(existsSync(join(rootDir, "src/components/auth-error-toast.tsx")), "AuthErrorToast component file must exist");
    const toastSource = readSource("src/components/auth-error-toast.tsx");
    assert.ok(toastSource.includes('role="alert"'), "AuthErrorToast must have role=alert accessibility attribute");
    assert.ok(!toastSource.includes("aria-live"), "AuthErrorToast must NOT double-announce with aria-live (role=alert is implicitly assertive)");
  });
});
