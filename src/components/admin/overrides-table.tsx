import { Lock, Shield, UserCheck, Users } from "lucide-react";
import type { PatronOverrideRecord } from "@/types/database";
import { isSealedCreatorAdmin } from "@/lib/admin";

export interface OverridesTableProps {
  overrides: PatronOverrideRecord[];
  creatorAdminIds?: string | null;
}

export function OverridesTable({ overrides, creatorAdminIds }: OverridesTableProps) {
  if (overrides.length === 0) {
    return (
      <div className="bg-[#121522] border border-[#23283E] rounded-xl p-8 flex flex-col items-center justify-center text-center gap-3">
        <div className="rounded-full bg-muted/20 p-3 text-muted-foreground">
          <Users className="h-6 w-6" aria-hidden="true" />
        </div>
        <h3 className="text-base font-semibold text-foreground">No Access Overrides</h3>
        <p className="text-xs text-muted-foreground max-w-sm">
          No administrative or complimentary passes have been granted yet. Use the registration form above to grant access.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[#121522] border border-[#23283E] rounded-xl overflow-hidden flex flex-col">
      <div className="p-4 sm:p-5 border-b border-[#23283E] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" aria-hidden="true" />
          <h2 className="font-display text-base font-bold text-foreground">
            Active Directory ({overrides.length})
          </h2>
        </div>
        <span className="text-xs text-muted-foreground">Two-Tier Admin Enforcement</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="border-b border-[#23283E] bg-[#090A0F]/60 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <th scope="col" className="py-3 px-4 sm:px-6">Patreon ID</th>
              <th scope="col" className="py-3 px-4">Role</th>
              <th scope="col" className="py-3 px-4">Admin Tier</th>
              <th scope="col" className="py-3 px-4">Audit Notes</th>
              <th scope="col" className="py-3 px-4">Granted By</th>
              <th scope="col" className="py-3 px-4">Date Added</th>
              <th scope="col" className="py-3 px-4 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#23283E]/60 text-foreground">
            {overrides.map((override) => {
              const sealed = isSealedCreatorAdmin(override, creatorAdminIds);
              const formattedDate = new Date(override.created_at_sec * 1000).toISOString().split("T")[0];

              return (
                <tr
                  key={override.patron_id}
                  className="hover:bg-[#090A0F]/40 transition-colors"
                >
                  <td className="py-3.5 px-4 sm:px-6 font-mono text-xs font-medium text-foreground">
                    <span data-testid="override-row-patron-id">{override.patron_id}</span>
                  </td>

                  <td className="py-3.5 px-4">
                    {override.role === "admin" ? (
                      <span
                        data-testid="override-badge-role"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#FBBF24]/10 text-[#FBBF24] border border-[#FBBF24]/30"
                      >
                        <Shield className="h-3 w-3" aria-hidden="true" />
                        Admin
                      </span>
                    ) : (
                      <span
                        data-testid="override-badge-role"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#38BDF8]/10 text-[#38BDF8] border border-[#38BDF8]/30"
                      >
                        <UserCheck className="h-3 w-3" aria-hidden="true" />
                        Comp
                      </span>
                    )}
                  </td>

                  <td className="py-3.5 px-4">
                    {sealed ? (
                      <span
                        data-testid="override-tier-sealed"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-[#FBBF24]/10 text-[#FBBF24] border border-[#FBBF24]/20"
                      >
                        <Lock className="h-3 w-3" aria-hidden="true" />
                        Creator Admin (Sealed)
                      </span>
                    ) : (
                      <span
                        data-testid="override-tier-panel"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-[#38BDF8]/10 text-[#38BDF8] border border-[#38BDF8]/20"
                      >
                        Panel Admin
                      </span>
                    )}
                  </td>

                  <td className="py-3.5 px-4 max-w-xs truncate text-xs text-muted-foreground">
                    {override.notes || "—"}
                  </td>

                  <td className="py-3.5 px-4 font-mono text-xs text-muted-foreground">
                    {override.granted_by}
                  </td>

                  <td className="py-3.5 px-4 font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {formattedDate}
                  </td>

                  <td className="py-3.5 px-4 text-right whitespace-nowrap">
                    {sealed ? (
                      <span
                        data-testid="override-sealed-indicator"
                        className="inline-flex items-center gap-1 text-xs text-[#FBBF24] font-medium"
                        title="Permanently sealed founding creator account"
                      >
                        <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Sealed</span>
                      </span>
                    ) : (
                      <span className="text-xs text-primary font-medium">
                        Active Pass
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
