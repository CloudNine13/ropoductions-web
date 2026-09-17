import { upsertPatronOverride } from "@/lib/db";
import type {
  PatreonCampaignMembersResponse,
  PatreonIdentityResponse,
  PatreonMemberAttributes,
  PatreonMembershipInfo,
  PatreonResource,
  PatreonTierAttributes,
  PatreonTokenResponse,
  PatronIdentity,
} from "@/types/auth";

export const PATREON_AUTHORIZE_URL = "https://www.patreon.com/oauth2/authorize";
export const PATREON_TOKEN_URL = "https://www.patreon.com/api/oauth2/token";
export const PATREON_IDENTITY_URL = "https://www.patreon.com/api/oauth2/v2/identity";
export const PATREON_CAMPAIGNS_URL = "https://www.patreon.com/api/oauth2/v2/campaigns";
export const DEFAULT_PATREON_SCOPES = [
  "identity",
  "identity[email]",
  "identity.memberships",
  "campaigns.members",
];

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
      "User-Agent": "ropoductions-web/0.1.0",
    },
    body: body.toString(),
    signal: AbortSignal.timeout(10_000),
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
      "User-Agent": "ropoductions-web/0.1.0",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Patreon identity request failed with status ${response.status}: ${errorText}`
    );
  }

  const payload = (await response.json()) as PatreonIdentityResponse;
  const data = payload?.data;
  if (!data?.id) {
    throw new Error("Patreon identity response missing data object");
  }

  return {
    patronId: data.id,
    email: data.attributes?.email ?? null,
    fullName:
      data.attributes?.full_name ?? data.attributes?.first_name ?? null,
  };
}

export async function getPatronCampaignMembership(
  campaignIdOrParams:
    | string
    | {
        campaignId: string;
        accessToken: string;
        patronId?: string;
        fetchFn?: typeof fetch;
      },
  maybeAccessToken?: string,
  maybeFetchFn: typeof fetch = fetch
): Promise<PatreonMembershipInfo | null> {
  let campaignId: string;
  let accessToken: string;
  let patronId: string | undefined;
  let fetchFn: typeof fetch;

  if (typeof campaignIdOrParams === "object") {
    campaignId = campaignIdOrParams.campaignId;
    accessToken = campaignIdOrParams.accessToken;
    patronId = campaignIdOrParams.patronId;
    fetchFn = campaignIdOrParams.fetchFn ?? fetch;
  } else {
    campaignId = campaignIdOrParams;
    accessToken = maybeAccessToken ?? "";
    fetchFn = maybeFetchFn;
  }

  const url = `${PATREON_CAMPAIGNS_URL}/${encodeURIComponent(
    campaignId
  )}/members?include=currently_entitled_tiers&fields%5Bmember%5D=patron_status,currently_entitled_amount_cents,email,full_name&fields%5Btier%5D=title,amount_cents`;

  let response = await fetchFn(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "ropoductions-web/0.1.0",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (response.status === 403) {
    const identityUrl = `${PATREON_IDENTITY_URL}?include=memberships.campaign,memberships.currently_entitled_tiers&fields%5Bmember%5D=patron_status,currently_entitled_amount_cents,email,full_name&fields%5Btier%5D=title,amount_cents`;
    response = await fetchFn(identityUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "ropoductions-web/0.1.0",
      },
      signal: AbortSignal.timeout(10_000),
    });
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Patreon campaign membership request failed with status ${response.status}: ${errorText}`
    );
  }
  const payload = (await response.json()) as PatreonCampaignMembersResponse;
  if (!payload?.data) {
    return null;
  }

  let memberData: PatreonResource<PatreonMemberAttributes> | undefined;
  if (Array.isArray(payload.data)) {
    if (patronId) {
      memberData = payload.data.find((m) => {
        const userData = m?.relationships?.user?.data;
        const uId = Array.isArray(userData) ? userData[0]?.id : userData?.id;
        return uId === patronId;
      });
      if (!memberData && payload.data.length === 1) {
        memberData = payload.data[0];
      }
    } else {
      memberData = payload.data[0];
    }
  } else if (
    typeof payload.data === "object" &&
    payload.data !== null &&
    "type" in payload.data &&
    payload.data.type === "user" &&
    Array.isArray(payload.included)
  ) {
    memberData = payload.included.find((item) => {
      if (item?.type !== "member") return false;
      const campRel = item.relationships?.campaign?.data;
      const cId = Array.isArray(campRel) ? campRel[0]?.id : campRel?.id;
      return cId === campaignId;
    }) as PatreonResource<PatreonMemberAttributes> | undefined;
  } else {
    memberData = payload.data as unknown as PatreonResource<PatreonMemberAttributes>;
  }
  if (!memberData) {
    return null;
  }

  const attributes = memberData.attributes ?? {};
  const patronStatus = attributes.patron_status ?? null;
  const currentlyEntitledAmountCents =
    attributes.currently_entitled_amount_cents ?? 0;

  let tierId: string | null = null;
  let tierName: string | null = null;

  const tierRel = memberData.relationships?.currently_entitled_tiers?.data;
  const tierRefs = Array.isArray(tierRel)
    ? tierRel
    : tierRel
    ? [tierRel]
    : [];

  if (tierRefs.length > 0 && Array.isArray(payload.included)) {
    const tierMap: Record<
      string,
      { id: string; title: string; amount_cents: number }
    > = {};
    for (const item of payload.included) {
      if (item && item.type === "tier" && item.id) {
        const tierAttrs = item.attributes as unknown as PatreonTierAttributes | undefined;
        tierMap[item.id] = {
          id: item.id,
          title: tierAttrs?.title ?? "",
          amount_cents: tierAttrs?.amount_cents ?? 0,
        };
      }
    }

    let selectedTier: {
      id: string;
      title: string;
      amount_cents: number;
    } | null = null;

    for (const ref of tierRefs) {
      if (!ref?.id) continue;
      const tierObj = tierMap[ref.id];
      if (tierObj) {
        if (!selectedTier || tierObj.amount_cents > selectedTier.amount_cents) {
          selectedTier = tierObj;
        }
      }
    }

    if (selectedTier) {
      tierId = selectedTier.id;
      tierName = selectedTier.title;
    } else if (tierRefs[0]?.id) {
      tierId = tierRefs[0].id;
    }
  } else if (tierRefs.length > 0 && tierRefs[0]?.id) {
    tierId = tierRefs[0].id;
  }

  return {
    memberId: memberData.id ?? null,
    patronStatus,
    currentlyEntitledAmountCents,
    tierId,
    tierName,
  };
}

export function parseInitialAdminPatreonIds(rawIds?: string | null): Set<string> {
  if (!rawIds) {
    return new Set();
  }

  const cleaned = rawIds.trim().replace(/^["']|["']$/g, "");
  const ids = cleaned
    .split(",")
    .map((id) => id.trim().replace(/^["']|["']$/g, ""))
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

export async function syncInitialAdminOverrides(
  db: D1Database,
  initialAdminIds?: string | null
): Promise<string[]> {
  const adminSet = parseInitialAdminPatreonIds(initialAdminIds);
  const synced: string[] = [];

  for (const patronId of adminSet) {
    await upsertPatronOverride(db, {
      patron_id: patronId,
      role: "admin",
      granted_by: "system_bootstrap",
      notes: "Initial Env Admin",
    });
    synced.push(patronId);
  }

  return synced;
}
