# Deferred Work

- source_spec: `_bmad-output/implementation-artifacts/spec-5-2-patron-override-directory-creation-interface.md`
  summary: Normalize the sealed-admin `granted_by` sentinel: Story 2.2 promises the OAuth callback writes `creator_bootstrap`, but `src/lib/patreon.ts` bootstrap/sync paths write `system_bootstrap`; `isSealedCreatorAdmin` checks both so behavior is correct, but the `creator_bootstrap` literal is dead code (spec drift).
  evidence: Security review of Story 5.3 (RPD-5.3-03); belongs to Story 2.2/5.2, not 5.3.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-4-paywall-interstitial-graceful-navigation.md`
  summary: Enforce revoked/lapsed sessions on `/api/game/[...asset]` streaming requests, not only on `/play` navigation.
  evidence: Story 2-4 covers `/play` and portal interstitials; asset-route session enforcement is already scoped to Epic 3 story 3-2.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-3-save-export-review-fixes.md`
  summary: Localize the save-export fallback error string across EN/JA/ES/RU/ZH/PL instead of hardcoded English.
  evidence: Blind review confirmed `setExportError(error instanceof Error ? error.message : "Save export failed")` bypasses next-intl; engine error text is dynamic English anyway, so a locale key is cosmetic until error copy is specified.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-3-save-export-review-fixes.md`
  summary: Fix `.gitignore` `!.github/workflows/*` negation which needs a preceding `!.github/` re-include to take effect.
  evidence: Blind review flagged gitignore negation semantics; the lines come from the synced local file, not this change, so left untouched to avoid altering user intent.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-3-save-export-review-fixes.md`
  summary: Add fake-timer coverage for the 60s download-URL revoke and dock exportingRef/mountedRef transitions.
  evidence: Blind review asked for timer/ref behavior tests; per testing guidelines these assert implementation details rather than behavior, so deferred until a jsdom render harness exists.
