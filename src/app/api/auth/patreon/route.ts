import { getAuthEnv } from "@/lib/cloudflare";
import {
  OAUTH_VERIFIER_COOKIE_MAX_AGE,
  OAUTH_VERIFIER_COOKIE_NAME,
  isSecureCookieScope,
  serializeCookie,
} from "@/lib/cookies";
import { generatePkcePair, generateRandomString, signValue } from "@/lib/crypto";
import { buildPatreonAuthorizeUrl, resolveOAuthOriginContext } from "@/lib/patreon";

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
  const originCtx = resolveOAuthOriginContext(request, authEnv.redirectUri);

  if (originCtx.isOriginMismatch) {
    const bounceUrl = new URL(`${originCtx.redirectOrigin}/api/auth/patreon`);
    bounceUrl.search = requestUrl.search;
    return new Response(null, {
      status: 302,
      headers: {
        Location: bounceUrl.toString(),
        Vary: "Host, X-Forwarded-Host, X-Forwarded-Proto",
        "Cache-Control": "no-store, max-age=0",
      },
    });
  }

  const redirectUri = originCtx.redirectUri;
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

  const isSecure = isSecureCookieScope(new URL(originCtx.redirectOrigin));
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
