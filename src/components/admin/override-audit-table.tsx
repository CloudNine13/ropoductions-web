import Link from "next/link";
import { ChevronLeft, ChevronRight, History } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { OverrideAuditRecord } from "@/types/database";

/** Bounded page size for the audit trail view. */
export const AUDIT_PAGE_SIZE = 25;

export interface OverrideAuditTableProps {
  entries: OverrideAuditRecord[];
  page: number;
  hasPrevious: boolean;
  hasNext: boolean;
}

const ACTION_LABEL_KEYS = {
  grant: "actionGrant",
  update: "actionUpdate",
  revoke: "actionRevoke",
} as const;

const ACTION_STYLES: Record<OverrideAuditRecord["action"], { testid: string; className: string }> = {
  grant: {
    testid: "audit-badge-grant",
    className: "bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/30",
  },
  update: {
    testid: "audit-badge-update",
    className: "bg-[#38BDF8]/10 text-[#38BDF8] border-[#38BDF8]/30",
  },
  revoke: {
    testid: "audit-badge-revoke",
    className: "bg-[#E11D48]/10 text-[#E11D48] border-[#E11D48]/30",
  },
};

function formatAuditTime(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 16).replace("T", " ");
}

export async function OverrideAuditTable({
  entries,
  page,
  hasPrevious,
  hasNext,
}: OverrideAuditTableProps) {
  const t = await getTranslations("admin.audit");
  const previousHref = page === 1 ? "/admin/overrides" : `/admin/overrides?auditPage=${page - 1}`;

  return (
    <section
      data-testid="audit-trail"
      className="bg-[#121522] border border-[#23283E] rounded-xl overflow-hidden flex flex-col"
    >
      <div className="p-4 sm:p-5 border-b border-[#23283E] flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" aria-hidden="true" />
            <h2 className="font-display text-base font-bold text-foreground">{t("title")}</h2>
          </div>
          <p className="text-xs text-muted-foreground">{t("subtitle")}</p>
        </div>
        <p className="text-xs text-muted-foreground sm:text-right">{t("appendOnly")}</p>
      </div>

      {entries.length === 0 ? (
        <div className="p-8 flex flex-col items-center justify-center text-center gap-3">
          <div className="rounded-full bg-muted/20 p-3 text-muted-foreground">
            <History className="h-6 w-6" aria-hidden="true" />
          </div>
          <h3 className="text-base font-semibold text-foreground">{t("emptyTitle")}</h3>
          <p className="text-xs text-muted-foreground max-w-sm">{t("emptyDesc")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <caption className="sr-only">{t("caption")}</caption>
            <thead>
              <tr className="border-b border-[#23283E] bg-[#090A0F]/60 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <th scope="col" className="py-3 px-4 sm:px-6">{t("time")}</th>
                <th scope="col" className="py-3 px-4">{t("actor")}</th>
                <th scope="col" className="py-3 px-4">{t("target")}</th>
                <th scope="col" className="py-3 px-4">{t("action")}</th>
                <th scope="col" className="py-3 px-4">{t("before")}</th>
                <th scope="col" className="py-3 px-4">{t("after")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#23283E]/60 text-foreground">
              {entries.map((entry) => {
                const style = ACTION_STYLES[entry.action];

                return (
                  <tr
                    key={entry.id}
                    data-testid="audit-row"
                    className="hover:bg-[#090A0F]/40 transition-colors"
                  >
                    <td className="py-3 px-4 sm:px-6 font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {formatAuditTime(entry.created_at_sec)}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-muted-foreground">
                      {entry.actor_patron_id}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs font-medium text-foreground">
                      {entry.target_patron_id}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        data-testid={style.testid}
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${style.className}`}
                      >
                        {t(ACTION_LABEL_KEYS[entry.action])}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-muted-foreground">
                      {entry.before_role ?? t("none")}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-muted-foreground">
                      {entry.after_role ?? t("none")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="p-3 sm:p-4 border-t border-[#23283E] flex items-center justify-between gap-3">
        <span className="text-xs font-mono text-muted-foreground">{t("pagerPage", { page })}</span>
        <nav className="flex items-center gap-2" aria-label={t("title")}>
          {hasPrevious ? (
            <Link
              href={previousHref}
              data-testid="audit-pager-previous"
              className="inline-flex items-center gap-1.5 min-h-[44px] px-3 py-2 rounded-md border border-[#23283E] text-xs sm:text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              <span>{t("pagerPrev")}</span>
            </Link>
          ) : null}
          {hasNext ? (
            <Link
              href={`/admin/overrides?auditPage=${page + 1}`}
              data-testid="audit-pager-next"
              className="inline-flex items-center gap-1.5 min-h-[44px] px-3 py-2 rounded-md border border-[#23283E] text-xs sm:text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span>{t("pagerNext")}</span>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : null}
        </nav>
      </div>
    </section>
  );
}
