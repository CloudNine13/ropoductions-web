import assert from "node:assert/strict";
import {
  OAUTH_VERIFIER_COOKIE_MAX_AGE,
  OAUTH_VERIFIER_COOKIE_NAME,
  SESSION_COOKIE_MAX_AGE,
  SESSION_COOKIE_NAME,
  parseCookies,
  serializeCookie,
} from "../src/lib/cookies";
import {
  decryptToken,
  encryptToken,
  generatePkceChallenge,
  generatePkcePair,
  generatePkceVerifier,
  generateRandomString,
  signValue,
  verifySignedValue,
} from "../src/lib/crypto";
import {
  bootstrapInitialAdminIfEligible,
  buildPatreonAuthorizeUrl,
  exchangeAuthorizationCode,
  getPatronIdentity,
  parseInitialAdminPatreonIds,
  PATREON_AUTHORIZE_URL,
  PATREON_IDENTITY_URL,
  PATREON_TOKEN_URL,
} from "../src/lib/patreon";
import {
  APPROVED_TIERS,
  findApprovedTier,
  isAccessAuthorized,
  MINIMUM_PLEDGE_CENTS,
} from "../src/lib/auth";
import {
  deletePatronOverride,
  getSessionById,
  getPatronOverride,
  upsertPatronOverride,
} from "../src/lib/db";
import type { SessionRecord } from "../src/types/database";
import { PATREON_CAMPAIGNS_URL } from "../src/lib/patreon";
import { GET as initiateAuth } from "../src/app/api/auth/patreon/route";
import { GET as callbackAuth } from "../src/app/api/auth/callback/route";

function logStep(step: string): void {
  console.log(`[TEST] ${step}`);
}

async function testPkceRfc7636Vector(): Promise<void> {
  logStep("Verifying RFC 7636 Appendix B PKCE test vector");
  const rfcVerifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const expectedChallenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
  const actualChallenge = await generatePkceChallenge(rfcVerifier);
  assert.equal(
    actualChallenge,
    expectedChallenge,
    "PKCE challenge must match RFC 7636 test vector"
  );

  const pair = await generatePkcePair(64);
  assert.equal(pair.method, "S256");
  assert.equal(pair.verifier.length, 64);
  assert.ok(/^[A-Za-z0-9_-]+$/.test(pair.verifier));
  assert.ok(/^[A-Za-z0-9_-]+$/.test(pair.challenge));
  assert.ok(!pair.challenge.includes("="));

  const minVerifier = generatePkceVerifier(10);
  assert.equal(minVerifier.length, 43);

  const maxVerifier = generatePkceVerifier(200);
  assert.equal(maxVerifier.length, 128);
}

async function testCryptoSigningAndEncryption(): Promise<void> {
  logStep("Verifying HMAC-SHA256 signing and AES-256-GCM encryption");
  const secret = "super_secret_test_key_123456789";
  const payload = "state_123:verifier_456";

  const signed = await signValue(payload, secret);
  assert.ok(signed.startsWith(`${payload}.`));

  const verified = await verifySignedValue(signed, secret);
  assert.equal(verified, payload);

  const wrongSecretVerified = await verifySignedValue(signed, "wrong_secret");
  assert.equal(wrongSecretVerified, null);

  const tamperedPayload = `tampered:${signed.split(".")[1]}`;
  const tamperedVerified = await verifySignedValue(tamperedPayload, secret);
  assert.equal(tamperedVerified, null);

  const invalidFormatVerified = await verifySignedValue("no_dot_here", secret);
  assert.equal(invalidFormatVerified, null);

  const malformedSignatureVerified = await verifySignedValue(
    "payload.!!!invalid_base64$$$===",
    secret
  );
  assert.equal(malformedSignatureVerified, null);
  const tokenToEncrypt = "patreon_access_token_sample_abc_123";
  const encKey = "token_encryption_key_32_bytes_sample";
  const encrypted = await encryptToken(tokenToEncrypt, encKey);
  assert.ok(encrypted.includes(":"));
  assert.notEqual(encrypted, tokenToEncrypt);

  const decrypted = await decryptToken(encrypted, encKey);
  assert.equal(decrypted, tokenToEncrypt);

  await assert.rejects(async () => {
    await decryptToken("malformed_token", encKey);
  });
}

function testCookies(): void {
  logStep("Verifying cookie serialization and parsing");
  const serialized = serializeCookie("test_cookie", "value_123", {
    maxAge: 600,
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
  });
  assert.ok(serialized.includes("test_cookie=value_123"));
  assert.ok(serialized.includes("max-age=600"));
  assert.ok(serialized.includes("HttpOnly"));
  assert.ok(serialized.includes("Secure"));
  assert.ok(serialized.includes("SameSite=Lax"));

  const parsed = parseCookies(
    `first=val1; test_cookie=value_123; quoted="inside_quotes"`
  );
  assert.equal(parsed["first"], "val1");
  assert.equal(parsed["test_cookie"], "value_123");
  assert.equal(parsed["quoted"], "inside_quotes");

  const emptyParsed = parseCookies(undefined);
  assert.deepEqual(emptyParsed, {});
}

async function testPatreonClient(): Promise<void> {
  logStep("Verifying Patreon API client functions");
  const authUrl = buildPatreonAuthorizeUrl({
    clientId: "client_abc",
    redirectUri: "http://localhost:3000/api/auth/callback",
    state: "random_state",
    codeChallenge: "challenge_xyz",
  });
  assert.ok(authUrl.startsWith(PATREON_AUTHORIZE_URL));
  const parsedUrl = new URL(authUrl);
  assert.equal(parsedUrl.searchParams.get("response_type"), "code");
  assert.equal(parsedUrl.searchParams.get("client_id"), "client_abc");
  assert.equal(
    parsedUrl.searchParams.get("scope"),
    "identity identity[email] campaigns.members"
  );
  assert.equal(parsedUrl.searchParams.get("code_challenge_method"), "S256");

  let capturedExchangeUrl = "";
  let capturedExchangeBody = "";
  const mockExchangeFetch: typeof fetch = async (input, init) => {
    capturedExchangeUrl = input.toString();
    capturedExchangeBody = init?.body?.toString() ?? "";
    return new Response(
      JSON.stringify({
        access_token: "mock_access_token_123",
        refresh_token: "mock_refresh_token_456",
        expires_in: 2592000,
        scope: "identity campaigns.members",
        token_type: "Bearer",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const tokens = await exchangeAuthorizationCode({
    code: "auth_code_789",
    codeVerifier: "code_verifier_xyz",
    clientId: "client_abc",
    clientSecret: "client_secret_def",
    redirectUri: "http://localhost:3000/api/auth/callback",
    fetchFn: mockExchangeFetch,
  });
  assert.equal(capturedExchangeUrl, PATREON_TOKEN_URL);
  assert.ok(capturedExchangeBody.includes("grant_type=authorization_code"));
  assert.ok(capturedExchangeBody.includes("code=auth_code_789"));
  assert.ok(capturedExchangeBody.includes("code_verifier=code_verifier_xyz"));
  assert.equal(tokens.access_token, "mock_access_token_123");

  const mockFailExchangeFetch: typeof fetch = async () => {
    return new Response("Unauthorized code", { status: 401 });
  };
  await assert.rejects(async () => {
    await exchangeAuthorizationCode({
      code: "bad_code",
      codeVerifier: "verifier",
      clientId: "id",
      clientSecret: "secret",
      redirectUri: "http://localhost/callback",
      fetchFn: mockFailExchangeFetch,
    });
  });

  let capturedIdentityAuthHeader = "";
  const mockIdentityFetch: typeof fetch = async (input, init) => {
    capturedIdentityAuthHeader = (init?.headers as Record<string, string>)?.[
      "Authorization"
    ];
    return new Response(
      JSON.stringify({
        data: {
          id: "987654321",
          type: "user",
          attributes: {
            email: "patron@example.com",
            full_name: "Studio Founder",
            first_name: "Studio",
          },
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const identity = await getPatronIdentity(
    "mock_access_token_123",
    mockIdentityFetch
  );
  assert.equal(
    capturedIdentityAuthHeader,
    "Bearer mock_access_token_123"
  );
  assert.equal(identity.patronId, "987654321");
  assert.equal(identity.email, "patron@example.com");
  assert.equal(identity.fullName, "Studio Founder");
}

async function testInitialAdminBootstrap(): Promise<void> {
  logStep("Verifying initial admin parsing and D1 bootstrap");
  const parsedSet = parseInitialAdminPatreonIds(
    " 11111 , 22222,33333 ,, 44444 "
  );
  assert.equal(parsedSet.size, 4);
  assert.ok(parsedSet.has("11111"));
  assert.ok(parsedSet.has("22222"));
  assert.ok(parsedSet.has("33333"));
  assert.ok(parsedSet.has("44444"));
  assert.ok(!parsedSet.has("55555"));

  const emptySet = parseInitialAdminPatreonIds("");
  assert.equal(emptySet.size, 0);

  const upsertCalls: unknown[][] = [];
  const mockDb = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async run() {
              upsertCalls.push(args);
              return { success: true };
            },
          };
        },
      };
    },
  } as unknown as D1Database;

  const bootstrapped = await bootstrapInitialAdminIfEligible(
    mockDb,
    "22222",
    "11111, 22222"
  );
  assert.equal(bootstrapped, true);
  assert.equal(upsertCalls.length, 1);
  assert.equal(upsertCalls[0][0], "22222");
  assert.equal(upsertCalls[0][1], "admin");
  assert.equal(upsertCalls[0][3], "system_bootstrap");

  const nonAdmin = await bootstrapInitialAdminIfEligible(
    mockDb,
    "99999",
    "11111, 22222"
  );
  assert.equal(nonAdmin, false);
  assert.equal(upsertCalls.length, 1);
}

type DbRow = Record<string, unknown>;

function createMockDb(): D1Database {
  const sessions = new Map<string, DbRow>();
  const patronOverrides = new Map<string, DbRow>();

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
        async run(): Promise<void> {
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
              return;
            }
            if (roleGuard !== null) existing.role = role;
            if (revokedGuard !== null) existing.revoked = revoked;
            Object.assign(existing, {
              patron_id, email, tier_id, tier_name, pledge_cents,
              encrypted_access_token, encrypted_refresh_token,
              token_expires_at_sec, expires_at_sec,
              last_verified_at_sec: lastVerifiedAt,
            });
            return;
          }
          if (sql === "UPDATE sessions SET revoked = 1 WHERE id = ?") {
            const target = sessions.get(stmt.params[0] as string);
            if (target) target.revoked = 1;
            return;
          }
          if (sql === "UPDATE sessions SET revoked = 1 WHERE patron_id = ?") {
            for (const s of sessions.values()) {
              if (s.patron_id === stmt.params[0]) s.revoked = 1;
            }
            return;
          }
          if (sql === "DELETE FROM sessions WHERE id = ?") {
            sessions.delete(stmt.params[0] as string);
            return;
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
              return;
            }
            existing.role = role;
            existing.granted_by = granted_by;
            existing.updated_at_sec = updatedAt;
            if (notesGuard !== null) existing.notes = notes;
            return;
          }
          if (sql === "DELETE FROM patron_overrides WHERE patron_id = ?") {
            patronOverrides.delete(stmt.params[0] as string);
            return;
          }
          throw new Error(`Unhandled run() query: ${sql}`);
        },
      };
      return stmt;
    },
  };
  return db as unknown as D1Database;
}

async function createSignedVerifierCookie(secret: string): Promise<{
  state: string;
  verifier: string;
  cookieHeader: string;
}> {
  const state = generateRandomString(32);
  const pkce = await generatePkcePair(64);
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = `${state}:${pkce.verifier}:${nowSec}`;
  const signedPayload = await signValue(payload, secret);
  return {
    state,
    verifier: pkce.verifier,
    cookieHeader: `${OAUTH_VERIFIER_COOKIE_NAME}=${signedPayload}`,
  };
}

function parseResponseCookies(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  if (typeof headers.getSetCookie === "function") {
    for (const cookieStr of headers.getSetCookie()) {
      Object.assign(result, parseCookies(cookieStr));
    }
  } else {
    const raw = headers.get("Set-Cookie");
    if (raw) {
      Object.assign(result, parseCookies(raw));
    }
  }
  return result;
}

async function testRouteHandlers(): Promise<void> {
  logStep("Verifying /api/auth/patreon and /api/auth/callback route handlers");
  process.env.PATREON_CLIENT_ID = "test_patreon_client_id";
  process.env.PATREON_CLIENT_SECRET = "test_patreon_client_secret";
  process.env.SESSION_SECRET = "test_session_secret_32_bytes_long";
  process.env.TOKEN_ENCRYPTION_KEY = "test_token_encryption_key_32_bytes";
  process.env.INITIAL_ADMIN_PATREON_IDS = "987654321, 555555555";
  process.env.PATREON_CAMPAIGN_ID = "camp_123456";

  const mockDb = createMockDb();
  globalThis.__D1_TEST_DB__ = mockDb;

  const initRequest = new Request("http://localhost:3000/api/auth/patreon", {
    method: "GET",
  });
  const initResponse = await initiateAuth(initRequest);
  assert.equal(initResponse.status, 302);

  const location = initResponse.headers.get("Location");
  assert.ok(location);
  assert.ok(location.startsWith(PATREON_AUTHORIZE_URL));

  const authUrl = new URL(location);
  const state = authUrl.searchParams.get("state");
  const codeChallenge = authUrl.searchParams.get("code_challenge");
  assert.ok(state);
  assert.ok(codeChallenge);

  const setCookie = initResponse.headers.get("Set-Cookie");
  assert.ok(setCookie);
  assert.ok(setCookie.includes(OAUTH_VERIFIER_COOKIE_NAME));
  assert.ok(setCookie.includes("HttpOnly"));

  const parsedCookie = parseCookies(setCookie);
  const signedVerifier = parsedCookie[OAUTH_VERIFIER_COOKIE_NAME];
  assert.ok(signedVerifier);

  const errorCallbackRequest = new Request(
    "http://localhost:3000/api/auth/callback?error=access_denied",
    { method: "GET" }
  );
  const errorCallbackResponse = await callbackAuth(errorCallbackRequest);
  assert.equal(errorCallbackResponse.status, 302);
  assert.ok(
    errorCallbackResponse.headers
      .get("Location")
      ?.includes("auth_error=access_denied")
  );
  assert.ok(
    errorCallbackResponse.headers
      .get("Set-Cookie")
      ?.includes("max-age=0")
  );

  const missingStateRequest = new Request(
    "http://localhost:3000/api/auth/callback?code=some_code",
    { method: "GET" }
  );
  const missingStateResponse = await callbackAuth(missingStateRequest);
  assert.equal(missingStateResponse.status, 302);
  assert.ok(
    missingStateResponse.headers
      .get("Location")
      ?.includes("missing_code_or_state")
  );

  const missingCookieRequest = new Request(
    `http://localhost:3000/api/auth/callback?code=some_code&state=${state}`,
    { method: "GET" }
  );
  const missingCookieResponse = await callbackAuth(missingCookieRequest);
  assert.equal(missingCookieResponse.status, 302);
  assert.ok(
    missingCookieResponse.headers
      .get("Location")
      ?.includes("missing_verifier")
  );

  const stateMismatchRequest = new Request(
    "http://localhost:3000/api/auth/callback?code=some_code&state=wrong_state",
    {
      method: "GET",
      headers: {
        Cookie: `${OAUTH_VERIFIER_COOKIE_NAME}=${signedVerifier}`,
      },
    }
  );
  const stateMismatchResponse = await callbackAuth(stateMismatchRequest);
  assert.equal(stateMismatchResponse.status, 302);
  assert.ok(
    stateMismatchResponse.headers
      .get("Location")
      ?.includes("invalid_state")
  );

  const httpsInitRequest = new Request(
    "https://example.com/api/auth/patreon",
    { method: "GET" }
  );
  const httpsInitResponse = await initiateAuth(httpsInitRequest);
  assert.ok(httpsInitResponse.headers.get("Set-Cookie")?.includes("Secure"));

  const httpsErrorRequest = new Request(
    "https://example.com/api/auth/callback?error=access_denied",
    { method: "GET" }
  );
  const httpsErrorResponse = await callbackAuth(httpsErrorRequest);
  assert.ok(httpsErrorResponse.headers.get("Set-Cookie")?.includes("Secure"));

  const originalFetch = globalThis.fetch;
  const mockPatreonSuccessFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = input.toString();
    if (urlStr === PATREON_TOKEN_URL) {
      return new Response(
        JSON.stringify({
          access_token: "live_access_token_xyz",
          refresh_token: "live_refresh_token_abc",
          expires_in: 2592000,
          scope: "identity campaigns.members",
          token_type: "Bearer",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (urlStr.startsWith(PATREON_IDENTITY_URL)) {
      return new Response(
        JSON.stringify({
          data: {
            id: "987654321",
            type: "user",
            attributes: {
              email: "founder@ropoductions.com",
              full_name: "Studio Founder",
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  try {
    let currentUserId = "987654321";
    let currentUserEmail = "founder@ropoductions.com";
    let currentUserFullName = "Studio Founder";
    let campaignMembershipData: unknown = null;
    let campaignMembershipIncluded: unknown[] = [];
    let campaignApiCalled = false;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = input.toString();
      if (urlStr === PATREON_TOKEN_URL) {
        return new Response(
          JSON.stringify({
            access_token: "live_access_token_xyz",
            refresh_token: "live_refresh_token_abc",
            expires_in: 2592000,
            scope: "identity campaigns.members",
            token_type: "Bearer",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (urlStr.startsWith(PATREON_IDENTITY_URL)) {
        return new Response(
          JSON.stringify({
            data: {
              id: currentUserId,
              type: "user",
              attributes: {
                email: currentUserEmail,
                full_name: currentUserFullName,
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (urlStr.startsWith(PATREON_CAMPAIGNS_URL)) {
        campaignApiCalled = true;
        return new Response(
          JSON.stringify({
            data: campaignMembershipData,
            included: campaignMembershipIncluded,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return originalFetch(input, init);
    }) as typeof fetch;

    // Scenario 1: Initial Admin Bootstrap & Override Short-Circuit
    const validCallbackRequest = new Request(
      `http://localhost:3000/api/auth/callback?code=valid_code_123&state=${state}`,
      {
        method: "GET",
        headers: {
          Cookie: `${OAUTH_VERIFIER_COOKIE_NAME}=${signedVerifier}`,
        },
      }
    );

    const validCallbackResponse = await callbackAuth(validCallbackRequest);
    assert.equal(validCallbackResponse.status, 302);
    assert.equal(validCallbackResponse.headers.get("Location"), "/play");
    assert.equal(campaignApiCalled, false, "Admin override must skip Patreon campaign API");

    const callbackCookies = parseResponseCookies(validCallbackResponse.headers);
    const signedSessionId1 = callbackCookies[SESSION_COOKIE_NAME];
    assert.ok(signedSessionId1, "Session cookie must be issued for admin override");
    assert.ok(validCallbackResponse.headers.get("Set-Cookie")?.includes("max-age=0"));

    const rawSetCookies = validCallbackResponse.headers.getSetCookie
      ? validCallbackResponse.headers.getSetCookie()
      : (validCallbackResponse.headers.get("Set-Cookie") || "").split(/,(?=\s*[^;=]+=)/);
    const sessionCookieHeaderStr = rawSetCookies.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
    assert.ok(sessionCookieHeaderStr, "Session cookie header must be present");
    assert.ok(sessionCookieHeaderStr.includes("HttpOnly"), "Session cookie must be HttpOnly");
    assert.ok(sessionCookieHeaderStr.includes("SameSite=Lax"), "Session cookie must be SameSite=Lax");
    assert.ok(sessionCookieHeaderStr.includes("max-age=2592000"), "Session cookie max-age must be 2592000");
    const sessionId1 = await verifySignedValue(
      signedSessionId1,
      process.env.SESSION_SECRET!
    );
    assert.ok(sessionId1);

    const sessionRecord1 = await getSessionById(mockDb, sessionId1);
    assert.ok(sessionRecord1);
    assert.equal(sessionRecord1.patron_id, "987654321");
    assert.equal(sessionRecord1.role, "admin");
    assert.equal(sessionRecord1.tier_id, "override_admin");
    assert.equal(sessionRecord1.tier_name, "Studio Admin");
    assert.equal(sessionRecord1.pledge_cents, 0);
    assert.equal(sessionRecord1.revoked, 0);

    const decryptedAccessToken1 = await decryptToken(
      sessionRecord1.encrypted_access_token,
      process.env.TOKEN_ENCRYPTION_KEY!
    );
    assert.equal(decryptedAccessToken1, "live_access_token_xyz");
    const decryptedRefreshToken1 = await decryptToken(
      sessionRecord1.encrypted_refresh_token,
      process.env.TOKEN_ENCRYPTION_KEY!
    );
    assert.equal(decryptedRefreshToken1, "live_refresh_token_abc");
    assert.equal(isAccessAuthorized(sessionRecord1), true);
    // Scenario 2: Complimentary Override Short-Circuit
    await upsertPatronOverride(mockDb, {
      patron_id: "comp_patron_888",
      role: "comp",
      granted_by: "system_admin",
      notes: "VIP Tester",
    });
    currentUserId = "comp_patron_888";
    currentUserEmail = "comp@example.com";
    currentUserFullName = "VIP Tester";
    campaignApiCalled = false;

    const compCookie = await createSignedVerifierCookie(process.env.SESSION_SECRET!);
    const compRequest = new Request(
      `http://localhost:3000/api/auth/callback?code=comp_code&state=${compCookie.state}`,
      {
        method: "GET",
        headers: { Cookie: compCookie.cookieHeader },
      }
    );

    const compResponse = await callbackAuth(compRequest);
    assert.equal(compResponse.status, 302);
    assert.equal(compResponse.headers.get("Location"), "/play");
    assert.equal(campaignApiCalled, false, "Comp override must skip Patreon campaign API");

    const compSignedSession = parseResponseCookies(compResponse.headers)[SESSION_COOKIE_NAME];
    assert.ok(compSignedSession);
    const compSessionId = await verifySignedValue(compSignedSession, process.env.SESSION_SECRET!);
    const compRecord = await getSessionById(mockDb, compSessionId!);
    assert.ok(compRecord);
    assert.equal(compRecord.role, "comp");
    assert.equal(compRecord.tier_id, "override_comp");
    assert.equal(compRecord.tier_name, "Complimentary Pass");
    assert.equal(compRecord.pledge_cents, 0);
    assert.equal(isAccessAuthorized(compRecord), true);

    // Scenario 3: Eligible Active Patron ($5+ Ork Patron)
    currentUserId = "regular_patron_111";
    currentUserEmail = "ork@example.com";
    currentUserFullName = "Ork Supporter";
    campaignApiCalled = false;
    campaignMembershipData = [
      {
        id: "mem_111",
        type: "member",
        attributes: {
          patron_status: "active_patron",
          currently_entitled_amount_cents: 500,
        },
        relationships: {
          currently_entitled_tiers: {
            data: [{ id: "tier_ork_5", type: "tier" }],
          },
        },
      },
    ];
    campaignMembershipIncluded = [
      {
        id: "tier_ork_5",
        type: "tier",
        attributes: {
          title: "Ork Patron",
          amount_cents: 500,
        },
      },
    ];

    const patronCookie = await createSignedVerifierCookie(process.env.SESSION_SECRET!);
    const patronRequest = new Request(
      `http://localhost:3000/api/auth/callback?code=patron_code&state=${patronCookie.state}`,
      {
        method: "GET",
        headers: { Cookie: patronCookie.cookieHeader },
      }
    );

    const patronResponse = await callbackAuth(patronRequest);
    assert.equal(patronResponse.status, 302);
    assert.equal(patronResponse.headers.get("Location"), "/play");
    assert.equal(campaignApiCalled, true, "Standard patron must query campaign API");

    const patronSignedSession = parseResponseCookies(patronResponse.headers)[SESSION_COOKIE_NAME];
    assert.ok(patronSignedSession);
    const patronSessionId = await verifySignedValue(patronSignedSession, process.env.SESSION_SECRET!);
    const patronRecord = await getSessionById(mockDb, patronSessionId!);
    assert.ok(patronRecord);
    assert.equal(patronRecord.role, "patron");
    assert.equal(patronRecord.tier_id, "tier_ork_5");
    assert.equal(patronRecord.tier_name, "Ork Patron");
    assert.equal(patronRecord.pledge_cents, 500);
    assert.equal(isAccessAuthorized(patronRecord), true);

    // Scenario 4: Sub-Threshold Patron (< $5)
    currentUserId = "sub_patron_222";
    campaignMembershipData = [
      {
        id: "mem_222",
        type: "member",
        attributes: {
          patron_status: "active_patron",
          currently_entitled_amount_cents: 300,
        },
      },
    ];
    campaignMembershipIncluded = [];

    const subCookie = await createSignedVerifierCookie(process.env.SESSION_SECRET!);
    const subRequest = new Request(
      `http://localhost:3000/api/auth/callback?code=sub_code&state=${subCookie.state}`,
      {
        method: "GET",
        headers: { Cookie: subCookie.cookieHeader },
      }
    );

    const subResponse = await callbackAuth(subRequest);
    assert.equal(subResponse.status, 302);
    assert.ok(subResponse.headers.get("Location")?.includes("auth_error=insufficient_pledge"));
    assert.equal(
      parseResponseCookies(subResponse.headers)[SESSION_COOKIE_NAME],
      undefined
    );

    // Scenario 5: Inactive / Lapsed Patron
    currentUserId = "lapsed_patron_333";
    campaignMembershipData = [
      {
        id: "mem_333",
        type: "member",
        attributes: {
          patron_status: "declined_patron",
          currently_entitled_amount_cents: 500,
        },
      },
    ];

    const lapsedCookie = await createSignedVerifierCookie(process.env.SESSION_SECRET!);
    const lapsedRequest = new Request(
      `http://localhost:3000/api/auth/callback?code=lapsed_code&state=${lapsedCookie.state}`,
      {
        method: "GET",
        headers: { Cookie: lapsedCookie.cookieHeader },
      }
    );

    const lapsedResponse = await callbackAuth(lapsedRequest);
    assert.equal(lapsedResponse.status, 302);
    assert.ok(lapsedResponse.headers.get("Location")?.includes("auth_error=inactive_patron"));
    assert.equal(
      parseResponseCookies(lapsedResponse.headers)[SESSION_COOKIE_NAME],
      undefined
    );

    // Scenario 6: Unpledged Visitor
    currentUserId = "unpledged_patron_444";
    campaignMembershipData = [];

    const unpledgedCookie = await createSignedVerifierCookie(process.env.SESSION_SECRET!);
    const unpledgedRequest = new Request(
      `http://localhost:3000/api/auth/callback?code=unpledged_code&state=${unpledgedCookie.state}`,
      {
        method: "GET",
        headers: { Cookie: unpledgedCookie.cookieHeader },
      }
    );

    const unpledgedResponse = await callbackAuth(unpledgedRequest);
    assert.equal(unpledgedResponse.status, 302);
    assert.ok(unpledgedResponse.headers.get("Location")?.includes("auth_error=insufficient_pledge"));
    assert.equal(
      parseResponseCookies(unpledgedResponse.headers)[SESSION_COOKIE_NAME],
      undefined
    );

    // Scenario 7: Missing PATREON_CAMPAIGN_ID configuration
    currentUserId = "unconfigured_patron_555";
    delete process.env.PATREON_CAMPAIGN_ID;

    const noCampCookie = await createSignedVerifierCookie(process.env.SESSION_SECRET!);
    const noCampRequest = new Request(
      `http://localhost:3000/api/auth/callback?code=no_camp_code&state=${noCampCookie.state}`,
      {
        method: "GET",
        headers: { Cookie: noCampCookie.cookieHeader },
      }
    );

    const noCampResponse = await callbackAuth(noCampRequest);
    assert.equal(noCampResponse.status, 302);
    assert.ok(noCampResponse.headers.get("Location")?.includes("auth_error=campaign_not_configured"));
    process.env.PATREON_CAMPAIGN_ID = "camp_123456";

    // Scenario 8: Missing TOKEN_ENCRYPTION_KEY server configuration
    const savedTokenKey = process.env.TOKEN_ENCRYPTION_KEY;
    process.env.TOKEN_ENCRYPTION_KEY = "";
    const noKeyCookie = await createSignedVerifierCookie(process.env.SESSION_SECRET!);
    const noKeyRequest = new Request(
      `http://localhost:3000/api/auth/callback?code=no_key_code&state=${noKeyCookie.state}`,
      {
        method: "GET",
        headers: { Cookie: noKeyCookie.cookieHeader },
      }
    );

    const noKeyResponse = await callbackAuth(noKeyRequest);
    assert.equal(noKeyResponse.status, 302);
    assert.ok(noKeyResponse.headers.get("Location")?.includes("auth_error=server_configuration_error"));
    process.env.TOKEN_ENCRYPTION_KEY = savedTokenKey;
  } finally {
    globalThis.fetch = originalFetch;
  }

  logStep("Verifying admin bootstrap failure does not block authentication");
  try {
    globalThis.fetch = mockPatreonSuccessFetch;

    const bootstrapFailureRequest = new Request(
      `http://localhost:3000/api/auth/callback?code=auth_code_bootstrap_eligible&state=${state}`,
      {
        method: "GET",
        headers: {
          Cookie: `${OAUTH_VERIFIER_COOKIE_NAME}=${signedVerifier}`,
        },
      }
    );

    const bootstrapFailureResponse = await callbackAuth(bootstrapFailureRequest);
    assert.equal(bootstrapFailureResponse.status, 302);
    assert.equal(bootstrapFailureResponse.headers.get("Location"), "/play");
  } finally {
    globalThis.fetch = originalFetch;
    delete (globalThis as Record<string, unknown>).__D1_TEST_DB__;
  }
}

async function main(): Promise<void> {
  console.log("Patreon OAuth and PKCE verification started.");
  await testPkceRfc7636Vector();
  await testCryptoSigningAndEncryption();
  testCookies();
  await testPatreonClient();
  await testInitialAdminBootstrap();
  await testRouteHandlers();
  console.log("Patreon OAuth and PKCE verification completed successfully.");
}

main().catch((err) => {
  console.error("Patreon OAuth and PKCE verification failed:", err);
  process.exit(1);
});
