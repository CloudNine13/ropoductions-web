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
