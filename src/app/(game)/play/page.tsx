import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Gamepad2, ArrowLeft, Shield, Sparkles, UserCheck } from "lucide-react";
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
    redirect(sessionClearHref("required"));
  }

  let result;
  try {
    result = await validateSessionAccess({
      db,
      sessionCookie,
      sessionSecret: authEnv.sessionSecret,
    });
  } catch {
    redirect(sessionClearHref("required"));
  }

  if (result.status !== "authorized") {
    redirect(sessionClearHref(mapSessionStatusToPaywall(result.status) ?? "required"));
  }

  const { session } = result;

  return (
    <div className="w-full min-h-screen flex flex-col bg-[#090A0F] text-foreground">
      <header className="w-full border-b border-border/80 bg-card/90 backdrop-blur-md px-4 py-3 flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-muted-foreground hover:text-foreground transition-colors min-h-[44px] px-2 cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Return to Studio Portal</span>
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

      <main className="flex-1 w-full flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-5xl aspect-video max-h-[calc(100dvh-5rem)] rounded-2xl border border-border/80 bg-card/60 backdrop-blur-md shadow-2xl flex flex-col items-center justify-center text-center p-6 space-y-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 border border-primary/30 shadow-[0_0_32px_rgba(34,197,94,0.2)]">
            <Gamepad2 className="h-8 w-8 text-primary" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Final Orginity: Chapter 1
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-md">
              RPG Maker MZ HTML5 Web Client authenticated for {session.tier_name}.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground pt-2">
            <UserCheck className="h-4 w-4 text-primary" aria-hidden="true" />
            <span>Session verified • Active patron access confirmed</span>
          </div>
        </div>
      </main>
    </div>
  );
}
