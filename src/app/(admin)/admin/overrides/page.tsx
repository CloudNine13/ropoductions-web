import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";
import { requireAdminSession } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function AdminOverridesPage() {
  await requireAdminSession();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between border-b border-[#23283E] pb-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" aria-hidden="true" />
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-wide text-foreground">
              Patron Overrides Directory
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Configure administrative and complimentary bypass access records.
          </p>
        </div>

        <Link
          href="/admin"
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-muted-foreground hover:text-foreground transition-colors min-h-[44px] px-3 py-2 rounded-md border border-[#23283E] hover:border-border"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Back to Dashboard</span>
        </Link>
      </div>

      <div className="bg-[#121522] border border-[#23283E] rounded-lg p-6 flex flex-col items-center justify-center text-center gap-3 py-12">
        <div className="rounded-full bg-primary/10 border border-primary/30 p-3 text-primary">
          <Users className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 className="text-base font-semibold text-foreground">
          Override Directory Interface
        </h2>
        <p className="text-xs text-muted-foreground max-w-md">
          The overrides management table and pass registration interface are provisioned in Story 5.2.
        </p>
      </div>
    </div>
  );
}
