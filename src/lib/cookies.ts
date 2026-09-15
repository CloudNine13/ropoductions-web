export const AGE_VERIFIED_COOKIE_NAME = "ropoductions_age_verified";
export const AGE_VERIFIED_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

/**
 * Check if the visitor has confirmed the 21+ age verification gate.
 */
export function hasAgeVerifiedCookie(): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  const cookies = document.cookie.split(";");
  for (const cookie of cookies) {
    const [name, rawValue] = cookie.trim().split("=");
    const value = rawValue?.replace(/^"|"$/g, "");
    if (name === AGE_VERIFIED_COOKIE_NAME && value === "true") {
      return true;
    }
  }
  return false;
}

/**
 * Sets the 30-day persistent age verification cookie.
 */
export function setAgeVerifiedCookie(): void {
  if (typeof document === "undefined") {
    return;
  }
  const isSecure = typeof window !== "undefined" && window.location.protocol === "https:";
  const secureFlag = isSecure ? "; Secure" : "";
  document.cookie = `${AGE_VERIFIED_COOKIE_NAME}=true; path=/; max-age=${AGE_VERIFIED_COOKIE_MAX_AGE}; SameSite=Lax${secureFlag}`;
}
