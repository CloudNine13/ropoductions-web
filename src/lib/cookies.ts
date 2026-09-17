export const AGE_VERIFIED_COOKIE_NAME = "ropoductions_age_verified";
export const AGE_VERIFIED_COOKIE_MAX_AGE = 5 * 24 * 60 * 60;

export const OAUTH_VERIFIER_COOKIE_NAME = "ropoductions_oauth_verifier";
export const OAUTH_VERIFIER_COOKIE_MAX_AGE = 10 * 60;

export const SESSION_COOKIE_NAME = "ropoductions_session";
export const SESSION_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

export interface CookieOptions {
  maxAge?: number;
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Lax" | "Strict" | "None";
}

export function serializeCookie(
  name: string,
  value: string,
  options: CookieOptions = {}
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`path=${options.path ?? "/"}`);
  if (options.maxAge !== undefined) {
    parts.push(`max-age=${options.maxAge}`);
  }
  if (options.httpOnly !== false) {
    parts.push("HttpOnly");
  }
  if (options.secure) {
    parts.push("Secure");
  }
  parts.push(`SameSite=${options.sameSite ?? "Lax"}`);
  return parts.join("; ");
}

export function parseCookies(cookieHeader?: string | null): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }
  const result: Record<string, string> = {};
  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const rawVal = pair.slice(idx + 1).trim();
    const val = rawVal.replace(/^"|"$/g, "");
    try {
      result[key] = decodeURIComponent(val);
    } catch {
      result[key] = val;
    }
  }
  return result;
}

export function hasAgeVerifiedCookie(): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  const cookies = parseCookies(document.cookie);
  return cookies[AGE_VERIFIED_COOKIE_NAME] === "true";
}

export function setAgeVerifiedCookie(): void {
  if (typeof document === "undefined") {
    return;
  }
  const isSecure = typeof window !== "undefined" && window.location.protocol === "https:";
  document.cookie = serializeCookie(AGE_VERIFIED_COOKIE_NAME, "true", {
    maxAge: AGE_VERIFIED_COOKIE_MAX_AGE,
    secure: isSecure,
    sameSite: "Lax",
    httpOnly: false,
  });
}
