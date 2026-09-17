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
