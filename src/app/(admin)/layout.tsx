import Link from "next/link";
import { ArrowLeft, Shield } from "lucide-react";
import { requireAdminSession } from "@/lib/admin";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdminSession();
  const t = await getTranslations("admin.layout");

  return (
    <div className="min-h-screen flex flex-col bg-[#090A0F] text-foreground antialiased">
      <header className="h-16 flex-none border-b border-[#23283E] bg-[#121522]/90 backdrop-blur-md px-4 sm:px-6 py-2.5 flex items-center justify-between z-40">
        <div className="flex items-center gap-6">
          <Link
            href="/admin"
            className="flex items-center gap-2 font-display text-base sm:text-lg font-bold tracking-wider text-foreground hover:text-primary transition-colors min-h-[44px]"
          >
            <span className="text-primary">{t("brand")}</span>
            <span>{t("brandAdmin")}</span>
          </Link>
          <nav className="flex items-center gap-1">
            <Link
              href="/admin"
              className="text-xs sm:text-sm font-medium text-foreground hover:text-primary transition-colors min-h-[44px] px-3 py-2 flex items-center rounded-md hover:bg-white/5"
            >
              {t("navDashboard")}
            </Link>
            <Link
              href="/admin/overrides"
              className="text-xs sm:text-sm font-medium text-muted-foreground hover:text-foreground transition-colors min-h-[44px] px-3 py-2 flex items-center rounded-md hover:bg-white/5"
            >
              {t("navOverrides")}
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div
            data-testid="admin-status-badge"
            className="inline-flex items-center gap-1.5 rounded-full border border-tier-gold/40 bg-tier-gold/10 px-3 py-1 text-xs font-mono text-tier-gold"
            title={t("statusTitle", { patronId: session.patron_id })}
          >
            <Shield className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{t("statusBadge")}</span>
          </div>

          <Link
            href="/play"
            data-testid="admin-nav-play"
            className="inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-muted-foreground hover:text-foreground transition-colors min-h-[44px] px-3 py-2 rounded-md border border-[#23283E] hover:border-border hover:bg-white/5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t("returnToGame")}</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
        {children}
      </main>
    </div>
  );
}
