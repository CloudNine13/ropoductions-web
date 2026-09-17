import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Shield, Sparkles } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { GameViewport } from "@/components/game-viewport";
import { getAuthEnv, getDatabase } from "@/lib/cloudflare";
import { AGE_VERIFIED_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/lib/cookies";
import { validateSessionAccess } from "@/lib/auth";
import { mapSessionStatusToPaywall, sessionClearHref } from "@/lib/paywall";

export const dynamic = "force-dynamic";

export default async function PlayPage() {
  const cookieStore = await cookies();
  const ageCookie = cookieStore.get(AGE_VERIFIED_COOKIE_NAME)?.value?.replace(/^"|"$/g, "");
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value?.replace(/^"|"$/g, "");

  if (ageCookie !== "true") {
    redirect("/?auth_required=true");
  }

  if (!sessionCookie) {
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
    redirect(sessionClearHref(mapSessionStatusToPaywall(result.status) ?? "required"));
  }

  const { session } = result;
  const t = await getTranslations("game");

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
          <div className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-mono text-accent">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            <span>{session.tier_name}</span>
          </div>
          {session.role !== "patron" && (
            <div className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs font-mono text-primary">
              <Shield className="h-3 w-3" aria-hidden="true" />
              <span className="capitalize">{session.role}</span>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 w-full min-h-0 overflow-hidden flex items-center justify-center p-2 sm:p-4">
        <GameViewport engineSrc="/engine/index.html" title={t("iframeTitle")} />
      </main>
    </div>
  );
}
