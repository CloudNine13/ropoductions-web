import type { SessionValidationResult } from "./auth";

export type PaywallType = "revoked" | "lapsed" | "required";

export type SessionStatus = SessionValidationResult["status"];

export const PAYWALL_CAMPAIGN_URL = "https://www.patreon.com/join/Ropoductions";

export const PATREON_LOGIN_HREF = "/api/auth/patreon";

export const SESSION_CLEAR_HREF = "/api/auth/session";

export const PAYWALL_TIERS = [
  { id: "tier-1", price: "$5", nameKey: "tier1Name", descKey: "tier1Desc" },
  { id: "tier-2", price: "$10", nameKey: "tier2Name", descKey: "tier2Desc" },
  { id: "tier-3", price: "$15", nameKey: "tier3Name", descKey: "tier3Desc" },
  { id: "tier-4", price: "$25", nameKey: "tier4Name", descKey: "tier4Desc" },
  { id: "tier-5", price: "$50", nameKey: "tier5Name", descKey: "tier5Desc" },
] as const;

export function resolvePaywallType(params: {
  paywall?: string;
  auth_required?: string;
}): PaywallType | null {
  if (params.paywall === "revoked") {
    return "revoked";
  }
  if (params.paywall === "lapsed") {
    return "lapsed";
  }
  if (params.paywall === "required" || params.auth_required === "true") {
    return "required";
  }
  return null;
}

export function mapSessionStatusToPaywall(status: SessionStatus): PaywallType | null {
  switch (status) {
    case "authorized":
      return null;
    case "invalid_signature":
    case "not_found":
      return "required";
    case "override_deleted":
    case "revoked":
      return "revoked";
    case "lapsed":
    case "unauthorized":
      return "lapsed";
  }
}

export function mapSessionStatusToPlayRedirect(status: SessionStatus): string | null {
  const paywall = mapSessionStatusToPaywall(status);
  return paywall ? `/?paywall=${paywall}` : null;
}

export function sessionClearHref(type: PaywallType): string {
  return `${SESSION_CLEAR_HREF}?paywall=${type}`;
}

export function getPaywallBannerMessageKey(
  type: PaywallType
): "bannerRevoked" | "bannerLapsed" | "bannerAuthRequired" {
  switch (type) {
    case "revoked":
      return "bannerRevoked";
    case "lapsed":
      return "bannerLapsed";
    case "required":
      return "bannerAuthRequired";
  }
}

const LANDING_SCROLL_KEY = "ropoductions:scrollY";

export function saveLandingScrollPosition(): void {
  try {
    sessionStorage.setItem(LANDING_SCROLL_KEY, String(window.scrollY));
    document.documentElement.classList.remove("scroll-smooth");
  } catch {
    /* private mode: fall back to default navigation scrolling */
  }
}

export function restoreLandingScrollPosition(): void {
  try {
    const saved = sessionStorage.getItem(LANDING_SCROLL_KEY);
    sessionStorage.removeItem(LANDING_SCROLL_KEY);
    if (saved !== null) {
      const y = parseInt(saved, 10);
      if (!isNaN(y)) {
        window.scrollTo(0, Math.max(0, y));
      }
    }
    document.documentElement.classList.add("scroll-smooth");
  } catch {
    /* private mode or no DOM: nothing stored, nothing to restore */
  }
}
