import { upsertPatronOverride } from "@/lib/db";
import type {
  PatreonIdentityResponse,
  PatreonTokenResponse,
  PatronIdentity,
} from "@/types/auth";

export const PATREON_AUTHORIZE_URL = "https://www.patreon.com/oauth2/authorize";
export const PATREON_TOKEN_URL = "https://www.patreon.com/api/oauth2/token";
export const PATREON_IDENTITY_URL = "https://www.patreon.com/api/oauth2/v2/identity";
export const DEFAULT_PATREON_SCOPES = ["identity", "campaigns.members"];

export interface BuildAuthorizeUrlParams {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scopes?: string[];
}

export function buildPatreonAuthorizeUrl({
  clientId,
  redirectUri,
  state,
  codeChallenge,
  scopes = DEFAULT_PATREON_SCOPES,
}: BuildAuthorizeUrlParams): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(" "),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return `${PATREON_AUTHORIZE_URL}?${params.toString()}`;
}

export interface ExchangeCodeParams {
  code: string;
  codeVerifier: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetchFn?: typeof fetch;
}

export async function exchangeAuthorizationCode({
  code,
  codeVerifier,
  clientId,
  clientSecret,
  redirectUri,
  fetchFn = fetch,
}: ExchangeCodeParams): Promise<PatreonTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    code_verifier: codeVerifier,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });

  const response = await fetchFn(PATREON_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Patreon token exchange failed with status ${response.status}: ${errorText}`
    );
  }

  return (await response.json()) as PatreonTokenResponse;
}

export async function getPatronIdentity(
  accessToken: string,
  fetchFn: typeof fetch = fetch
): Promise<PatronIdentity> {
  const url = `${PATREON_IDENTITY_URL}?fields%5Buser%5D=email,first_name,full_name,image_url,url`;
  const response = await fetchFn(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Patreon identity request failed with status ${response.status}: ${errorText}`
    );
  }

  const payload = (await response.json()) as PatreonIdentityResponse;
  const data = payload.data;

  return {
    patronId: data.id,
    email: data.attributes?.email ?? null,
    fullName:
      data.attributes?.full_name ?? data.attributes?.first_name ?? null,
  };
}

export function parseInitialAdminPatreonIds(rawIds?: string | null): Set<string> {
  if (!rawIds) {
    return new Set();
  }

  const ids = rawIds
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  return new Set(ids);
}

export async function bootstrapInitialAdminIfEligible(
  db: D1Database,
  patronId: string,
  initialAdminIds?: string | null
): Promise<boolean> {
  const adminSet = parseInitialAdminPatreonIds(initialAdminIds);
  if (!adminSet.has(patronId)) {
    return false;
  }

  await upsertPatronOverride(db, {
    patron_id: patronId,
    role: "admin",
    granted_by: "system_bootstrap",
    notes: "Initial Env Admin",
  });

  return true;
}
