import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";
import { requireAdminSession } from "@/lib/admin";
import { getDatabase } from "@/lib/cloudflare";
import { listPatronOverrides } from "@/lib/db";
import { OverrideForm } from "@/components/admin/override-form";
import { OverridesTable } from "@/components/admin/overrides-table";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function AdminOverridesPage() {
  await requireAdminSession();
  const db = await getDatabase();
  const overrides = await listPatronOverrides(db, 100);
  const t = await getTranslations("admin.overrides");
  return (
    <div className="flex flex-col gap-6 rounded-xl">
      <div className="flex items-center justify-between border-b border-[#23283E] pb-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" aria-hidden="true" />
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-wide text-foreground">
              {t("title")}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>

        <Link
          href="/admin"
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-muted-foreground hover:text-foreground transition-colors min-h-[44px] px-3 py-2 rounded-md border border-[#23283E] hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>{t("backToDashboard")}</span>
        </Link>
      </div>

      <OverrideForm />

      <OverridesTable overrides={overrides} />
    </div>
  );
}
