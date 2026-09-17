import assert from "node:assert/strict";
import {
  OAUTH_VERIFIER_COOKIE_MAX_AGE,
  OAUTH_VERIFIER_COOKIE_NAME,
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

async function testRouteHandlers(): Promise<void> {
  logStep("Verifying /api/auth/patreon and /api/auth/callback route handlers");
  process.env.PATREON_CLIENT_ID = "test_patreon_client_id";
  process.env.PATREON_CLIENT_SECRET = "test_patreon_client_secret";
  process.env.SESSION_SECRET = "test_session_secret_32_bytes_long";
  process.env.INITIAL_ADMIN_PATREON_IDS = "987654321, 555555555";

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
  try {
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
    assert.ok(
      validCallbackResponse.headers
        .get("Set-Cookie")
        ?.includes("max-age=0")
    );
  } finally {
    globalThis.fetch = originalFetch;
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
