# Deferred Work

- source_spec: `_bmad-output/implementation-artifacts/spec-5-2-patron-override-directory-creation-interface.md`
  summary: Normalize the sealed-admin `granted_by` sentinel: Story 2.2 promises the OAuth callback writes `creator_bootstrap`, but `src/lib/patreon.ts` bootstrap/sync paths write `system_bootstrap`; `isSealedCreatorAdmin` checks both so behavior is correct, but the `creator_bootstrap` literal is dead code (spec drift).
  evidence: Security review of Story 5.3 (RPD-5.3-03); belongs to Story 2.2/5.2, not 5.3.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-4-paywall-interstitial-graceful-navigation.md`
  summary: Enforce revoked/lapsed sessions on `/api/game/[...asset]` streaming requests, not only on `/play` navigation.
  evidence: Story 2-4 covers `/play` and portal interstitials; asset-route session enforcement is already scoped to Epic 3 story 3-2.
  resolution: CLOSED 2026-09-19 (epic-5 retro verification) — `/api/game` route executes `validateSessionAccess` (`src/app/api/game/[[...asset]]/route.ts:7,225`), which revokes sessions on revoked flag, expiry, and deleted-override per Story 2.4.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-3-save-export-review-fixes.md`
  summary: Localize the save-export fallback error string across EN/JA/ES/RU/ZH/PL instead of hardcoded English.
  evidence: Blind review confirmed `setExportError(error instanceof Error ? error.message : "Save export failed")` bypasses next-intl; engine error text is dynamic English anyway, so a locale key is cosmetic until error copy is specified.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-3-save-export-review-fixes.md`
  summary: Fix `.gitignore` `!.github/workflows/*` negation which needs a preceding `!.github/` re-include to take effect.
  evidence: Blind review flagged gitignore negation semantics; the lines come from the synced local file, not this change, so left untouched to avoid altering user intent.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-3-save-export-review-fixes.md`
  summary: Add fake-timer coverage for the 60s download-URL revoke and dock exportingRef/mountedRef transitions.
  evidence: Blind review asked for timer/ref behavior tests; per testing guidelines these assert implementation details rather than behavior, so deferred until a jsdom render harness exists.
- source_spec: `_bmad-output/implementation-artifacts/epic-5-retro-2026-09-19.md`
  summary: 4-eyes (second-person approval) for `admin`-role grants. Formally recorded NON-GOAL for v1: founder access is env-guaranteed (Amendment A-2026-09-19-01), one panel admin minting admins is observable once Story 5.5 lands its audit trail, and a co-sign state machine is a UX cost this studio does not carry yet. Reopen trigger: more than a handful of operators hold admin keys.
  evidence: Epic 5 retro Team Discussion (Winston/John convergence; adversarial lens #8); owner decisions 2026-09-19.
- source_spec: `_bmad-output/implementation-artifacts/epic-5-retro-2026-09-19.md`
  summary: Extract the thrice-duplicated Radix destructive-confirm dialog shell (save-reset, save-import, revoke-override) into one shared component; current copies are byte-identical except max-w. Deferred until a fourth consumer or a styling change forces it, to avoid touching two shipped epic-4 dialogs inside epic-5 scope.
  evidence: Finding F13 (DupSizeViews); dialog shell at revoke-override-button.tsx:84-87 == save-reset-dialog.tsx:100-103 == save-import-dialog.tsx:170-173.
- source_spec: `_bmad-output/implementation-artifacts/epic-5-retro-2026-09-19.md`
  summary: Override directory is capped at 100 rows (`overrides/page.tsx:16`) with no overflow signal; pagination or an N-of-M label rides Story 5.5's trail view. Reopen trigger: first page overflow.
  evidence: Edge-case lens finding 4.
- source_spec: `_bmad-output/implementation-artifacts/epic-5-retro-2026-09-19.md`
  summary: "Date Added" renders UTC (`overrides-table.tsx:72`); label the column or render viewer-timezone once Story 5.4 touches the table.
  evidence: Edge-case lens finding 3.
- source_spec: `_bmad-output/planning-artifacts/analytics/analytics-epic-6-2026-09-21.md`
  summary: Reconcile the stale `public/engine/**` byte-identical mirror contract for the engine plugin (named in `AGENTS.md` and still enforced by the epic-4 retro item-4 wording): the directory does not exist on `develop` — only stale, gitignored copies linger inside `.worktrees/*` — consistent with PR #47 moving MZ shell delivery to the R2 `engine/` prefix streamed via `/engine/[...path]`. Update the repository-rule text (and anything checksumming the mirror) to the R2-served reality. Explicitly NOT Epic 6 scope per the epic-6 brief's out-of-scope list. Reopen trigger: next engine-plugin touch requires a live mirror rule or its removal.
  evidence: Epic 6 analysis §6.3 (known consequences); verified 2026-09-21 that `public/engine` is absent at the `develop` tip while `AGENTS.md` shell-delivery rules describe the R2 `engine/` prefix sync.
- source_spec: `_bmad-output/planning-artifacts/analytics/analytics-epic-6-2026-09-21.md`
  summary: Branded 404 page. Owner may want a studio-branded 404 later; explicitly not Epic 6 scope. Under owner decision Q9 (no wall) every non-admin request for `/admin` returns the stock Next.js 404, so any custom 404 body must preserve the status-code-only semantics pinned by `e2e/admin.spec.ts`: HTTP 404, no `Location` header, no visitor-state differentiation that would create an enumeration oracle.
  evidence: Epic 6 brief out-of-scope list; rejected alternatives D1/D2 (analytics §5.3) showed a shared 404 body changes the response of every unmatched URL and a check inside a streamed shell degrades to a 200 soft-404.
