import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AGE_VERIFIED_COOKIE_NAME, SESSION_COOKIE_NAME, unquoteCookieValue } from "./lib/cookies";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const ageVerified = unquoteCookieValue(request.cookies.get(AGE_VERIFIED_COOKIE_NAME)?.value) === "true";
  const sessionToken = unquoteCookieValue(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  // Protect /api/game/* routes: must return 403 JSON envelope without valid session
  if (pathname === "/api/game" || pathname.startsWith("/api/game/")) {
    if (!sessionToken || !ageVerified) {
      return NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Active patron session and 21+ age verification required.",
          },
        },
        {
          status: 403,
          headers: {
            "Cache-Control": "no-store",
            "Cross-Origin-Resource-Policy": "same-origin",
          },
        }
      );
    }
  }

  // Protect /play route: redirect unverified visitors to landing page
  if (pathname === "/play" || pathname.startsWith("/play/")) {
    if (!ageVerified || !sessionToken) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.searchParams.set("auth_required", "true");
      return NextResponse.redirect(url);
    }
  }

  // Anti-enumeration for /admin lives entirely in (admin)/layout.tsx:
  // requireAdminSession → notFound() (404). Middleware deliberately does NOT
  // route /admin so no redirect ever leaks route existence.

  return NextResponse.next();
}

export const config = {
  matcher: ["/play/:path*", "/api/game/:path*"],
};
