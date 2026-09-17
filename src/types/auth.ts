export interface PatreonTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export interface PatreonUserAttributes {
  email?: string | null;
  first_name?: string | null;
  full_name?: string | null;
  image_url?: string | null;
  url?: string | null;
}

export interface PatreonIdentityResponse {
  data: {
    id: string;
    type: string;
    attributes: PatreonUserAttributes;
  };
}

export interface PatronIdentity {
  patronId: string;
  email: string | null;
  fullName: string | null;
}

export interface OAuthStatePayload {
  state: string;
  codeVerifier: string;
  createdAtSec: number;
}

export interface PatreonOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  campaignId?: string;
  initialAdminPatreonIds?: string;
}

export interface PatreonTierAttributes {
  title: string;
  amount_cents: number;
  description?: string | null;
  published?: boolean;
  url?: string | null;
}

export interface PatreonMemberAttributes {
  patron_status?: string | null;
  currently_entitled_amount_cents?: number;
  is_follower?: boolean;
  last_charge_date?: string | null;
  last_charge_status?: string | null;
  lifetime_support_cents?: number;
  pledge_relationship_start?: string | null;
  email?: string | null;
  full_name?: string | null;
}

export interface PatreonResource<TAttributes = Record<string, unknown>> {
  id: string;
  type: string;
  attributes: TAttributes;
  relationships?: Record<
    string,
    {
      data:
        | { id: string; type: string }
        | Array<{ id: string; type: string }>
        | null;
    }
  >;
}
export interface PatreonCampaignMembersResponse {
  data:
    | Array<PatreonResource<PatreonMemberAttributes>>
    | PatreonResource<PatreonMemberAttributes>;
  included?: Array<
    | PatreonResource<PatreonTierAttributes>
    | PatreonResource<Record<string, unknown>>
  >;
  links?: {
    next?: string;
  };
}

export interface PatreonMembershipInfo {
  memberId: string | null;
  patronStatus: string | null;
  currentlyEntitledAmountCents: number;
  tierId: string | null;
  tierName: string | null;
}
