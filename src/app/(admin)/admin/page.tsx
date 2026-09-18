import Link from "next/link";
import { ArrowUpRight, Gamepad2, ShieldCheck, Users } from "lucide-react";
import { requireAdminSession } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const session = await requireAdminSession();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 border-b border-[#23283E] pb-4">
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-wide text-foreground">
          Studio Administration Dashboard
        </h1>
        <p className="text-sm text-muted-foreground">
          Internal access controls and studio management for Ropoductions.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        <div className="bg-[#121522] border border-[#23283E] rounded-lg p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-primary font-medium text-sm">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            <span>Admin Credentials</span>
          </div>
          <div className="flex flex-col gap-1.5 text-xs font-mono">
            <div className="flex justify-between py-1 border-b border-[#23283E]/60">
              <span className="text-muted-foreground">Patron ID:</span>
              <span className="text-foreground">{session.patron_id}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#23283E]/60">
              <span className="text-muted-foreground">Role:</span>
              <span className="text-tier-gold uppercase font-bold">{session.role}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Entitlement:</span>
              <span className="text-foreground">{session.tier_name}</span>
            </div>
          </div>
        </div>

        <Link
          href="/admin/overrides"
          className="group bg-[#121522] border border-[#23283E] hover:border-primary/50 rounded-lg p-5 flex flex-col justify-between gap-4 transition-all hover:bg-[#121522]/80 min-h-[44px]"
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-foreground font-medium text-sm">
                <Users className="h-4 w-4 text-primary" aria-hidden="true" />
                <span>Patron Overrides</span>
              </div>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" aria-hidden="true" />
            </div>
            <p className="text-xs text-muted-foreground">
              Manage runtime administrative and complimentary playtest passes in D1.
            </p>
          </div>
          <span className="text-xs font-mono text-primary group-hover:underline">
            Open Overrides Directory →
          </span>
        </Link>

        <Link
          href="/play"
          className="group bg-[#121522] border border-[#23283E] hover:border-tier-gold/50 rounded-lg p-5 flex flex-col justify-between gap-4 transition-all hover:bg-[#121522]/80 min-h-[44px]"
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-foreground font-medium text-sm">
                <Gamepad2 className="h-4 w-4 text-tier-gold" aria-hidden="true" />
                <span>Launch Web Player</span>
              </div>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-tier-gold transition-colors" aria-hidden="true" />
            </div>
            <p className="text-xs text-muted-foreground">
              Direct access to the sandboxed RPG Maker MZ web client.
            </p>
          </div>
          <span className="text-xs font-mono text-tier-gold group-hover:underline">
            Launch Game →
          </span>
        </Link>
      </div>
    </div>
  );
}
