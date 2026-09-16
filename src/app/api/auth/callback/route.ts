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

  const isSecure = requestUrl.protocol === "https:";
  const clearCookieHeader = serializeCookie(OAUTH_VERIFIER_COOKIE_NAME, "", {
    maxAge: 0,
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: isSecure,
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

  const parts = rawPayload.split(":");
  if (parts.length < 2) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/?auth_error=malformed_verifier",
        "Set-Cookie": clearCookieHeader,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  }

  const expectedState = parts[0];
  const codeVerifier = parts[1];
  const createdAtSec = parts[2] ? parseInt(parts[2], 10) : null;

  if (createdAtSec !== null && !isNaN(createdAtSec)) {
    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec - createdAtSec > 600) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/?auth_error=expired_verifier",
          "Set-Cookie": clearCookieHeader,
          "Cache-Control": "no-store, max-age=0",
        },
      });
    }
  }

  if (expectedState !== state) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/?auth_error=invalid_state",
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
      const bootstrapped = await bootstrapInitialAdminIfEligible(
        db,
        identity.patronId,
        authEnv.initialAdminPatreonIds
      );
      if (bootstrapped) {
        console.log(
          `[AUTH] Successfully bootstrapped initial admin for patron_id=${identity.patronId}`
        );
      }
    } catch (dbErr) {
      console.error("[AUTH] Database error during admin bootstrap:", dbErr);
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
    const rawMessage =
      err instanceof Error ? err.message : "token_exchange_failed";
    const sanitizedMessage = rawMessage.slice(0, 120);
    return new Response(null, {
      status: 302,
      headers: {
        Location: `/?auth_error=${encodeURIComponent(sanitizedMessage)}`,
        "Set-Cookie": clearCookieHeader,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  }
}
