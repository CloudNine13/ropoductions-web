"use client";

import { useActionState, useEffect, useRef } from "react";
import { UserPlus, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { upsertOverrideAction, type OverrideActionState } from "@/app/(admin)/admin/overrides/actions";

const initialState: OverrideActionState = {
  success: false,
};

export function OverrideForm() {
  const [state, formAction, pending] = useActionState(upsertOverrideAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success && formRef.current) {
      formRef.current.reset();
    }
  }, [state.success, state.timestamp]);

  return (
    <div className="bg-[#121522] border border-[#23283E] rounded-xl p-5 sm:p-6 flex flex-col gap-5">
      <div className="flex items-center gap-2.5 pb-2 border-b border-[#23283E]">
        <div className="rounded-md bg-primary/10 border border-primary/20 p-2 text-primary">
          <UserPlus className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h2 className="font-display text-lg font-bold text-foreground">
            Grant or Update Access Pass
          </h2>
          <p className="text-xs text-muted-foreground">
            Assign elevated administrative or complimentary playtester overrides by numeric Patreon ID.
          </p>
        </div>
      </div>

      <form
        ref={formRef}
        action={formAction}
        data-testid="override-form"
        className="flex flex-col gap-4"
        noValidate
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="override-patron-id"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Patreon ID <span className="text-rose-500">*</span>
            </label>
            <input
              id="override-patron-id"
              name="patron_id"
              type="text"
              inputMode="numeric"
              pattern="^\d{1,20}$"
              required
              placeholder="e.g. 12345678"
              disabled={pending}
              data-testid="override-input-patron-id"
              aria-describedby={state.fieldErrors?.patronId ? "patron-id-error" : undefined}
              className="bg-[#090A0F] border border-[#23283E] focus:border-primary focus:ring-1 focus:ring-primary rounded-lg px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 transition-colors min-h-[44px] focus:outline-none"
            />
            {state.fieldErrors?.patronId && (
              <p id="patron-id-error" className="text-xs text-rose-400">
                {state.fieldErrors.patronId}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="override-role"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Assigned Role <span className="text-rose-500">*</span>
            </label>
            <select
              id="override-role"
              name="role"
              required
              disabled={pending}
              defaultValue="comp"
              data-testid="override-select-role"
              aria-describedby={state.fieldErrors?.role ? "role-error" : undefined}
              className="bg-[#090A0F] border border-[#23283E] focus:border-primary focus:ring-1 focus:ring-primary rounded-lg px-3.5 py-2.5 text-sm text-foreground transition-colors min-h-[44px] focus:outline-none cursor-pointer"
            >
              <option value="comp">Comp Pass (Complimentary Playtest)</option>
              <option value="admin">Admin Pass (Studio Staff)</option>
            </select>
            {state.fieldErrors?.role && (
              <p id="role-error" className="text-xs text-rose-400">
                {state.fieldErrors.role}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="override-notes"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Audit Notes <span className="text-muted-foreground/60">(Optional)</span>
            </label>
            <input
              id="override-notes"
              name="notes"
              type="text"
              maxLength={500}
              placeholder="e.g. Lead QA tester pass"
              disabled={pending}
              data-testid="override-input-notes"
              className="bg-[#090A0F] border border-[#23283E] focus:border-primary focus:ring-1 focus:ring-primary rounded-lg px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 transition-colors min-h-[44px] focus:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
          <p className="text-xs text-muted-foreground">
            Sealed Creator Admins cannot be reassigned or modified through this interface.
          </p>

          <button
            type="submit"
            disabled={pending}
            data-testid="override-submit-btn"
            className="inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-medium text-sm px-5 py-2.5 rounded-lg transition-all min-h-[44px] min-w-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer disabled:cursor-not-allowed w-full sm:w-auto"
          >
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                <span>Save Access Pass</span>
              </>
            )}
          </button>
        </div>

        {state.error && (
          <div
            role="status"
            aria-live="polite"
            data-testid="override-form-status"
            className="flex items-center gap-2 rounded-lg bg-rose-500/10 border border-rose-500/30 px-3.5 py-2.5 text-sm text-rose-400"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" aria-hidden="true" />
            <span>{state.error}</span>
          </div>
        )}

        {state.success && state.message && (
          <div
            role="status"
            aria-live="polite"
            data-testid="override-form-status"
            className="flex items-center gap-2 rounded-lg bg-primary/10 border border-primary/30 px-3.5 py-2.5 text-sm text-primary"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span>{state.message}</span>
          </div>
        )}
      </form>
    </div>
  );
}
