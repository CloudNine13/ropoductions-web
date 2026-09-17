import { getAuthEnv, getDatabase } from "@/lib/cloudflare";
import {
  OAUTH_VERIFIER_COOKIE_NAME,
  parseCookies,
  serializeCookie,
  SESSION_COOKIE_MAX_AGE,
  SESSION_COOKIE_NAME,
} from "@/lib/cookies";
import { encryptToken, signValue, verifySignedValue } from "@/lib/crypto";
import { getPatronOverride, upsertSession } from "@/lib/db";
import {
  findApprovedTier,
  MINIMUM_PLEDGE_CENTS,
} from "@/lib/auth";
import {
  bootstrapInitialAdminIfEligible,
  exchangeAuthorizationCode,
  getPatronCampaignMembership,
  getPatronIdentity,
} from "@/lib/patreon";
import type { CreateSessionInput } from "@/types/database";
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

    const db = await getDatabase();
    await bootstrapInitialAdminIfEligible(
      db,
      identity.patronId,
      authEnv.initialAdminPatreonIds
    );

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
      const sessionId = crypto.randomUUID();
      const sessionRecord: CreateSessionInput = {
        id: sessionId,
        patron_id: identity.patronId,
        email: identity.email,
        role: override.role,
        tier_id: `override_${override.role}`,
        tier_name:
          override.role === "admin" ? "Studio Admin" : "Complimentary Pass",
        pledge_cents: 0,
        encrypted_access_token: encryptedAccessToken,
        encrypted_refresh_token: encryptedRefreshToken,
        token_expires_at_sec: tokenExpiresAtSec,
        expires_at_sec: sessionExpiresAtSec,
        revoked: 0,
        created_at_sec: nowSec,
        last_verified_at_sec: nowSec,
      };

      await upsertSession(db, sessionRecord);

      const signedSessionId = await signValue(
        sessionId,
        authEnv.sessionSecret
      );
      const sessionCookieHeader = serializeCookie(
        SESSION_COOKIE_NAME,
        signedSessionId,
        {
          maxAge: SESSION_COOKIE_MAX_AGE,
          httpOnly: true,
          sameSite: "Lax",
          secure: isSecure,
          path: "/",
        }
      );

      const headers = new Headers();
      headers.set("Location", "/play");
      headers.append("Set-Cookie", clearCookieHeader);
      headers.append("Set-Cookie", sessionCookieHeader);
      headers.set("Cache-Control", "no-store, max-age=0");
      return new Response(null, {
        status: 302,
        headers,
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

    if (
      membership.patronStatus === "declined_patron" ||
      membership.patronStatus === "former_patron" ||
      membership.patronStatus !== "active_patron"
    ) {
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

    const sessionId = crypto.randomUUID();
    const sessionRecord: CreateSessionInput = {
      id: sessionId,
      patron_id: identity.patronId,
      email: identity.email,
      role: "patron",
      tier_id: tierId,
      tier_name: tierName,
      pledge_cents: pledgeCents,
      encrypted_access_token: encryptedAccessToken,
      encrypted_refresh_token: encryptedRefreshToken,
      token_expires_at_sec: tokenExpiresAtSec,
      expires_at_sec: sessionExpiresAtSec,
      revoked: 0,
      created_at_sec: nowSec,
      last_verified_at_sec: nowSec,
    };

    await upsertSession(db, sessionRecord);

    const signedSessionId = await signValue(
      sessionId,
      authEnv.sessionSecret
    );
    const sessionCookieHeader = serializeCookie(
      SESSION_COOKIE_NAME,
      signedSessionId,
      {
        maxAge: SESSION_COOKIE_MAX_AGE,
        httpOnly: true,
        sameSite: "Lax",
        secure: isSecure,
        path: "/",
      }
    );

    const headers = new Headers();
    headers.set("Location", "/play");
    headers.append("Set-Cookie", clearCookieHeader);
    headers.append("Set-Cookie", sessionCookieHeader);
    headers.set("Cache-Control", "no-store, max-age=0");
    return new Response(null, {
      status: 302,
      headers,
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
