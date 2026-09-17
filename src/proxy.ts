import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AGE_VERIFIED_COOKIE_NAME, SESSION_COOKIE_NAME } from "./lib/cookies";

function unquote(val?: string | null): string | undefined {
  if (!val) return undefined;
  return val.replace(/^"|"$/g, "");
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const ageVerified = unquote(request.cookies.get(AGE_VERIFIED_COOKIE_NAME)?.value) === "true";
  const sessionToken = unquote(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  // Protect /api/game/* routes: must return 403 JSON envelope without valid session
  if (pathname.startsWith("/api/game")) {
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

  return NextResponse.next();
}

export const config = {
  matcher: ["/play/:path*", "/api/game/:path*"],
};
