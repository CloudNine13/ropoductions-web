import { getAuthEnv, getDatabase } from "@/lib/cloudflare";
import {
  OAUTH_VERIFIER_COOKIE_NAME,
  isSecureCookieScope,
  parseCookies,
  serializeCookie,
  SESSION_COOKIE_MAX_AGE,
} from "@/lib/cookies";
import { encryptToken, verifySignedValue } from "@/lib/crypto";
import { getPatronOverride } from "@/lib/db";
import {
  findApprovedTier,
  issueSessionResponse,
  MINIMUM_PLEDGE_CENTS,
} from "@/lib/auth";
import {
  bootstrapInitialAdminIfEligible,
  exchangeAuthorizationCode,
  getPatronCampaignMembership,
  getPatronIdentity,
  resolveOAuthOriginContext,
} from "@/lib/patreon";
export const dynamic = "force-dynamic";

const PROVIDER_ERROR_ALLOWLIST = [
  "access_denied",
  "invalid_request",
  "unauthorized_client",
  "unsupported_response_type",
  "invalid_scope",
  "server_error",
  "temporarily_unavailable",
];

export async function GET(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  const authEnv = await getAuthEnv();
  let originCtx;
  try {
    originCtx = resolveOAuthOriginContext(request, authEnv.redirectUri);
  } catch {
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/?auth_error=server_configuration_error",
        "Cache-Control": "no-store, max-age=0",
      },
    });
  }

  if (originCtx.isOriginMismatch) {
    const bounceUrl = new URL(`${originCtx.redirectOrigin}/api/auth/callback`);
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

  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const error = requestUrl.searchParams.get("error");

  const isSecure = isSecureCookieScope(new URL(originCtx.redirectOrigin));
  const clearCookieHeader = serializeCookie(OAUTH_VERIFIER_COOKIE_NAME, "", {
    maxAge: 0,
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: isSecure,
  });
  if (error) {
    const providerError = PROVIDER_ERROR_ALLOWLIST.includes(error)
      ? error
      : "provider_error";
    return new Response(null, {
      status: 302,
      headers: {
        Location: `/?auth_error=${encodeURIComponent(providerError)}`,
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

  if (!authEnv.sessionSecret || !authEnv.tokenEncryptionKey) {
    console.error("[AUTH] Missing SESSION_SECRET or TOKEN_ENCRYPTION_KEY");
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/?auth_error=server_configuration_error",
        "Set-Cookie": clearCookieHeader,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  }

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

  const redirectUri = originCtx.redirectUri;
  try {
    const tokens = await exchangeAuthorizationCode({
      code,
      codeVerifier,
      clientId: authEnv.clientId,
      clientSecret: authEnv.clientSecret,
      redirectUri,
    });

    const identity = await getPatronIdentity(tokens.access_token);

    const db = await getDatabase();
    try {
      await bootstrapInitialAdminIfEligible(
        db,
        identity.patronId,
        authEnv.initialAdminPatreonIds
      );
    } catch {
      // Admin bootstrap must not block authentication; the session proceeds without elevated role.
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const tokenExpiresIn =
      typeof tokens.expires_in === "number" && tokens.expires_in > 0
        ? tokens.expires_in
        : 2592000;
    const tokenExpiresAtSec = nowSec + tokenExpiresIn;
    const sessionExpiresAtSec = nowSec + SESSION_COOKIE_MAX_AGE;
    const encryptedAccessToken = await encryptToken(
      tokens.access_token,
      authEnv.tokenEncryptionKey
    );
    const encryptedRefreshToken = await encryptToken(
      tokens.refresh_token ?? "",
      authEnv.tokenEncryptionKey
    );

    const override = await getPatronOverride(db, identity.patronId);
    if (override && (override.role === "admin" || override.role === "comp")) {
      return await issueSessionResponse({
        db,
        sessionSecret: authEnv.sessionSecret,
        patronId: identity.patronId,
        email: identity.email,
        role: override.role,
        tierId: `override_${override.role}`,
        tierName:
          override.role === "admin" ? "Studio Admin" : "Complimentary Pass",
        pledgeCents: 0,
        encryptedAccessToken,
        encryptedRefreshToken,
        tokenExpiresAtSec,
        sessionExpiresAtSec,
        nowSec,
        isSecure,
        clearCookieHeader,
      });
    }

    if (!authEnv.campaignId) {
      console.error("[AUTH] PATREON_CAMPAIGN_ID is not configured");
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/?auth_error=campaign_not_configured",
          "Set-Cookie": clearCookieHeader,
          "Cache-Control": "no-store, max-age=0",
        },
      });
    }

    const membership = await getPatronCampaignMembership({
      campaignId: authEnv.campaignId,
      accessToken: tokens.access_token,
      patronId: identity.patronId,
    });

    if (!membership || membership.patronStatus === null) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/?auth_error=insufficient_pledge",
          "Set-Cookie": clearCookieHeader,
          "Cache-Control": "no-store, max-age=0",
        },
      });
    }

    if (membership.patronStatus !== "active_patron") {
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/?auth_error=inactive_patron",
          "Set-Cookie": clearCookieHeader,
          "Cache-Control": "no-store, max-age=0",
        },
      });
    }

    if (membership.currentlyEntitledAmountCents < MINIMUM_PLEDGE_CENTS) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/?auth_error=insufficient_pledge",
          "Set-Cookie": clearCookieHeader,
          "Cache-Control": "no-store, max-age=0",
        },
      });
    }

    const approvedTier = findApprovedTier(
      membership.tierName,
      membership.currentlyEntitledAmountCents
    );

    if (!approvedTier) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/?auth_error=insufficient_pledge",
          "Set-Cookie": clearCookieHeader,
          "Cache-Control": "no-store, max-age=0",
        },
      });
    }

    const tierName = membership.tierName || approvedTier.name;
    const tierId = membership.tierId || `tier_${approvedTier.cents}`;
    const pledgeCents = membership.currentlyEntitledAmountCents;

    return await issueSessionResponse({
      db,
      sessionSecret: authEnv.sessionSecret,
      patronId: identity.patronId,
      email: identity.email,
      role: "patron",
      tierId,
      tierName,
      pledgeCents,
      encryptedAccessToken,
      encryptedRefreshToken,
      tokenExpiresAtSec,
      sessionExpiresAtSec,
      nowSec,
      isSecure,
      clearCookieHeader,
    });
  } catch {
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/?auth_error=token_exchange_failed",
        "Set-Cookie": clearCookieHeader,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  }
}
