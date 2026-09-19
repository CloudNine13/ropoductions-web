import Link from "next/link";
import { ArrowUpRight, Gamepad2, ShieldCheck, Users } from "lucide-react";
import { requireAdminSession } from "@/lib/admin";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const session = await requireAdminSession();
  const t = await getTranslations("admin.dashboard");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 border-b border-[#23283E] pb-4">
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-wide text-foreground">
          {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("subtitle")}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        <div className="bg-[#121522] border border-[#23283E] rounded-xl p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-primary font-medium text-sm">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            <span>{t("credentialsTitle")}</span>
          </div>
          <div className="flex flex-col gap-1.5 text-xs font-mono">
            <div className="flex justify-between py-1 border-b border-[#23283E]/60">
              <span className="text-muted-foreground">{t("patronId")}</span>
              <span className="text-foreground">{session.patron_id}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#23283E]/60">
              <span className="text-muted-foreground">{t("role")}</span>
              <span className="text-tier-gold uppercase font-bold">{session.role}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">{t("entitlement")}</span>
              <span className="text-foreground">{session.tier_name}</span>
            </div>
          </div>
        </div>

        <Link
          href="/admin/overrides"
          className="group bg-[#121522] border border-[#23283E] hover:border-primary/50 rounded-xl p-5 flex flex-col justify-between gap-4 transition-colors duration-150 hover:bg-[#121522]/80 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-foreground font-medium text-sm">
                <Users className="h-4 w-4 text-primary" aria-hidden="true" />
                <span>{t("overridesTitle")}</span>
              </div>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" aria-hidden="true" />
            </div>
            <p className="text-xs text-muted-foreground">
              {t("overridesDesc")}
            </p>
          </div>
          <span className="text-xs font-mono text-primary group-hover:underline">
            {t("overridesOpen")}
          </span>
        </Link>

        <Link
          href="/play"
          className="group bg-[#121522] border border-[#23283E] hover:border-tier-gold/50 rounded-xl p-5 flex flex-col justify-between gap-4 transition-colors duration-150 hover:bg-[#121522]/80 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tier-gold"
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-foreground font-medium text-sm">
                <Gamepad2 className="h-4 w-4 text-tier-gold" aria-hidden="true" />
                <span>{t("launchPlayerTitle")}</span>
              </div>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-tier-gold transition-colors" aria-hidden="true" />
            </div>
            <p className="text-xs text-muted-foreground">
              {t("launchPlayerDesc")}
            </p>
          </div>
          <span className="text-xs font-mono text-tier-gold group-hover:underline">
            {t("launchGame")}
          </span>
        </Link>
      </div>
    </div>
  );
}
