import { getAuthEnv, getDatabase } from "@/lib/cloudflare";
import {
  OAUTH_VERIFIER_COOKIE_NAME,
  parseCookies,
  serializeCookie,
} from "@/lib/cookies";
import { verifySignedValue } from "@/lib/crypto";
import {
  bootstrapInitialAdminIfEligible,
  exchangeAuthorizationCode,
  getPatronIdentity,
} from "@/lib/patreon";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const error = requestUrl.searchParams.get("error");

  const clearCookieHeader = serializeCookie(OAUTH_VERIFIER_COOKIE_NAME, "", {
    maxAge: 0,
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
  });

  if (error) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: `/?auth_error=${encodeURIComponent(error)}`,
        "Set-Cookie": clearCookieHeader,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  }

  if (!code || !state) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/?auth_error=missing_code_or_state",
        "Set-Cookie": clearCookieHeader,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  }

  const cookies = parseCookies(request.headers.get("Cookie"));
  const signedVerifier = cookies[OAUTH_VERIFIER_COOKIE_NAME];
  if (!signedVerifier) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/?auth_error=missing_verifier",
        "Set-Cookie": clearCookieHeader,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  }

  const authEnv = await getAuthEnv();
  const rawPayload = await verifySignedValue(
    signedVerifier,
    authEnv.sessionSecret
  );

  if (!rawPayload) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/?auth_error=invalid_cookie_signature",
        "Set-Cookie": clearCookieHeader,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  }

  const colonIndex = rawPayload.indexOf(":");
  if (colonIndex === -1) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/?auth_error=malformed_verifier",
        "Set-Cookie": clearCookieHeader,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  }

  const expectedState = rawPayload.slice(0, colonIndex);
  const codeVerifier = rawPayload.slice(colonIndex + 1);

  if (expectedState !== state) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/?auth_error=state_mismatch",
        "Set-Cookie": clearCookieHeader,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  }

  const redirectUri =
    authEnv.redirectUri || `${requestUrl.origin}/api/auth/callback`;

  try {
    const tokens = await exchangeAuthorizationCode({
      code,
      codeVerifier,
      clientId: authEnv.clientId,
      clientSecret: authEnv.clientSecret,
      redirectUri,
    });

    const identity = await getPatronIdentity(tokens.access_token);

    try {
      const db = await getDatabase();
      await bootstrapInitialAdminIfEligible(
        db,
        identity.patronId,
        authEnv.initialAdminPatreonIds
      );
    } catch {
    }

    return new Response(null, {
      status: 302,
      headers: {
        Location: "/play",
        "Set-Cookie": clearCookieHeader,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "token_exchange_failed";
    return new Response(null, {
      status: 302,
      headers: {
        Location: `/?auth_error=${encodeURIComponent(message)}`,
        "Set-Cookie": clearCookieHeader,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  }
}
