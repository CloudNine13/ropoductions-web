import { SESSION_COOKIE_NAME, serializeCookie } from "@/lib/cookies";
import type { PaywallType } from "@/lib/paywall";

export const dynamic = "force-dynamic";

const PAYWALL_ALLOWLIST: readonly PaywallType[] = ["revoked", "lapsed", "required"];

export async function GET(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  const requested = requestUrl.searchParams.get("paywall");
  const paywall: PaywallType = PAYWALL_ALLOWLIST.includes(requested as PaywallType)
    ? (requested as PaywallType)
    : "required";
  const isSecure = requestUrl.protocol === "https:";
  const clearSessionHeader = serializeCookie(SESSION_COOKIE_NAME, "", {
    maxAge: 0,
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: isSecure,
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: `/?paywall=${paywall}`,
      "Set-Cookie": clearSessionHeader,
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
