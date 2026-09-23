import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Shield, Lock } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { GameViewport } from "@/components/game-viewport";
import { getAuthEnv, getDatabase } from "@/lib/cloudflare";
import { resolveAdminAccess } from "@/lib/admin";
import { AGE_VERIFIED_COOKIE_NAME, SESSION_COOKIE_NAME, unquoteCookieValue } from "@/lib/cookies";
import { validateSessionAccess } from "@/lib/auth";
import { mapSessionStatusToPaywall, sessionClearHref } from "@/lib/paywall";
// [CLEANUP_TAG: CF_DIAGNOSTIC]
import { logCloudflareDiagnostic } from "@/lib/cloudflare-diagnostic";

export const dynamic = "force-dynamic";

export default async function PlayPage() {
  const cookieStore = await cookies();
  const ageCookie = unquoteCookieValue(cookieStore.get(AGE_VERIFIED_COOKIE_NAME)?.value);
  const sessionCookie = unquoteCookieValue(cookieStore.get(SESSION_COOKIE_NAME)?.value);

  if (ageCookie !== "true") {
    // [CLEANUP_TAG: CF_DIAGNOSTIC]
    logCloudflareDiagnostic("play_page_age_unverified", { hasAgeCookie: false }, "warn");
    redirect("/?auth_required=true");
  }

  if (!sessionCookie) {
    // [CLEANUP_TAG: CF_DIAGNOSTIC]
    logCloudflareDiagnostic("play_page_no_session", { hasSessionCookie: false }, "warn");
    redirect(sessionClearHref("required"));
  }

  let db;
  let authEnv;
  try {
    db = await getDatabase();
    authEnv = await getAuthEnv();
  } catch {
    // Infrastructure failure, not an invalid session: keep the cookie so retry works after recovery.
    redirect("/?paywall=required");
  }

  let result;
  try {
    result = await validateSessionAccess({
      db,
      sessionCookie,
      sessionSecret: authEnv.sessionSecret,
      initialAdminIds: authEnv.initialAdminPatreonIds,
    });
  } catch {
    redirect("/?paywall=required");
  }

  if (result.status !== "authorized") {
    // [CLEANUP_TAG: CF_DIAGNOSTIC]
    logCloudflareDiagnostic("play_page_session_rejected", { status: result.status }, "warn");
    redirect(sessionClearHref(mapSessionStatusToPaywall(result.status) ?? "required"));
  }

  const { session } = result;
  const isAdminSession = (await resolveAdminAccess()) === "admin";
  const t = await getTranslations("game");
  // [CLEANUP_TAG: CF_DIAGNOSTIC]
  logCloudflareDiagnostic("play_page_authorized", {
    isAdminSession,
    tierName: session.tier_name,
  });

  return (
    <div className="w-full h-[100dvh] flex flex-col bg-[#090A0F] text-foreground overflow-hidden">
      <header className="h-14 flex-none border-b border-border/80 bg-card/90 backdrop-blur-md px-4 py-2.5 flex items-center justify-between z-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-muted-foreground hover:text-foreground transition-colors min-h-[44px] px-2 cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>{t("returnToPortal")}</span>
        </Link>
        <div className="flex items-center gap-3">
          <div
            data-testid="play-status-badge"
            className="inline-flex items-center gap-1.5 rounded-full border border-tier-gold/40 bg-tier-gold/10 px-3 py-1 text-xs font-mono text-tier-gold max-w-[38vw]"
            title={isAdminSession ? t("adminBadge") : session.tier_name}
          >
            {isAdminSession ? (
              <Shield className="h-3 w-3 shrink-0" aria-hidden="true" />
            ) : (
              <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
            )}
            <span className="truncate">{isAdminSession ? t("adminBadge") : session.tier_name}</span>
          </div>
          {isAdminSession && (
            <Link
              href="/admin"
              data-testid="play-admin-entry"
              className="inline-flex items-center gap-1.5 px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:text-sm min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Shield className="h-4 w-4" aria-hidden="true" />
              <span>{t("adminPanel")}</span>
            </Link>
          )}
        </div>
      </header>

      <main className="flex-1 w-full min-h-0 overflow-hidden flex items-center justify-center p-2 sm:p-4">
        <GameViewport engineSrc="/engine/index.html" title={t("iframeTitle")} />
      </main>
    </div>
  );
}
