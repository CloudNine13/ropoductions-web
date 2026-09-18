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
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/?auth_error=client_configuration_error",
        "Cache-Control": "no-store, max-age=0",
      },
    });
  }

  if (!authEnv.sessionSecret) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/?auth_error=server_configuration_error",
        "Cache-Control": "no-store, max-age=0",
      },
    });
  }

  const requestUrl = new URL(request.url);
  const host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    requestUrl.host;
  const proto =
    request.headers.get("x-forwarded-proto") ||
    (isSecureCookieScope(requestUrl) ? "https" : requestUrl.protocol.replace(":", ""));
  const clientOrigin = `${proto}://${host}`;

  const canonicalOrigin =
    host.startsWith("127.0.0.1") || host.startsWith("localhost")
      ? `http://localhost:${requestUrl.port || "3000"}`
      : clientOrigin;

  const redirectUri =
    authEnv.redirectUri || `${canonicalOrigin}/api/auth/callback`;
  const redirectOrigin = new URL(redirectUri).origin;

  if (clientOrigin !== redirectOrigin) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${redirectOrigin}/api/auth/patreon`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  }
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
