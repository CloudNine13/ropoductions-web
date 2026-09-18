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
  if (pathname.startsWith("/play")) {
    if (!ageVerified || !sessionToken) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.searchParams.set("auth_required", "true");
      return NextResponse.redirect(url);
    }
  }

  // Protect /admin routes: anti-enumeration guard
  // Must NEVER redirect unauthorized visitors (which leaks route existence).
  // Passes to (admin)/layout.tsx where authoritative D1 session evaluation returns notFound() (404).
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/play/:path*", "/api/game/:path*"],
};
