import { getAuthEnv } from "@/lib/cloudflare";
import {
  OAUTH_VERIFIER_COOKIE_MAX_AGE,
  OAUTH_VERIFIER_COOKIE_NAME,
  isSecureCookieScope,
  serializeCookie,
} from "@/lib/cookies";
import { generatePkcePair, generateRandomString, signValue } from "@/lib/crypto";
import { buildPatreonAuthorizeUrl } from "@/lib/patreon";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const authEnv = await getAuthEnv();
  if (!authEnv.clientId) {
    return new Response(
      JSON.stringify({
        error: {
          code: "MISSING_CONFIG",
          message: "PATREON_CLIENT_ID is not configured",
        },
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const requestUrl = new URL(request.url);
  const redirectUri =
    authEnv.redirectUri || `${requestUrl.origin}/api/auth/callback`;

  const state = generateRandomString(32);
  const pkce = await generatePkcePair(64);

  const nowSec = Math.floor(Date.now() / 1000);
  const payload = `${state}:${pkce.verifier}:${nowSec}`;
  const signedPayload = await signValue(payload, authEnv.sessionSecret);

  const authorizeUrl = buildPatreonAuthorizeUrl({
    clientId: authEnv.clientId,
    redirectUri,
    state,
    codeChallenge: pkce.challenge,
  });

  const isSecure = isSecureCookieScope(requestUrl);
  const cookie = serializeCookie(OAUTH_VERIFIER_COOKIE_NAME, signedPayload, {
    maxAge: OAUTH_VERIFIER_COOKIE_MAX_AGE,
    httpOnly: true,
    sameSite: "Lax",
    secure: isSecure,
    path: "/",
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorizeUrl,
      "Set-Cookie": cookie,
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
