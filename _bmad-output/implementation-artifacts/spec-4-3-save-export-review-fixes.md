---
title: '4-3 save export review fixes + local config sync'
type: 'bugfix'
created: '2026-09-18'
status: 'done'
route: 'oneshot'
review_loop_iteration: 1
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** PR #37 ships client zip save export with fake status labels, empty-zip false success, controlled/uncontrolled race, silent errors, and string-contains tests; local .gitignore/AGENTS.md/DESIGN.md updates are unpushed.

**Approach:** Fix P0/P1 review blockers in save-export/save-hud-dock/save-bridge plus behavioral tests, and sync local config/docs files onto feat/4-3-client-side-zip-save-export, then push to update PR #37.

</frozen-after-approval>

## Implementation Notes

- Worktree `.worktrees/feat-4-3-client-side-zip-save-export` at PR head 1f4c448; 287/287 unit tests pass, `npm test` (D1+OAuth) passes, `tsc --noEmit` clean, 0 merge conflicts vs origin/develop.
- `src/lib/save-export.ts`: invalid-date throw, array guards, global/config-in-slots skip, `buildSaveZipFromMap` single-normalize, `triggerDownload` throws outside browser + try/finally + 60s revoke, `exportSaves` empty/malformed guards + legacy-timeout fix + early date validation.
- `src/components/save-hud-dock.tsx`: status-aware labels with aria-live, crimson CircleX error (persists, no auto-clear), error text as accessible name, aria-busy, exportingRef + mountedRef guards, controlled-prop early return with guard.
- `tests/`: URL mock restore, browser-throw test, 4 regression tests (invalid date, slots collision, array slots, empty-export reject), legacy test DOM stubs, dock assertions updated.
- Synced local `.gitignore`, `AGENTS.md`, `DESIGN.md`, `handoff-design-animation-fixes-2026-09-18.md` into PR branch (skipped `skills-lock.json`: ignored by the synced `.gitignore`).

## Review Triage Log

- Blind hunter: error only in tooltip, no persistent text — medium, patched (error text is now the accessible name + crimson icon; visible label still swaps idle/exporting/success).
- Blind hunter: error aria-label falls back to generic — medium, patched (same fix).
- Blind hunter: controlled branch skips exportingRef — low, patched (guard set in controlled branch too).
- Blind hunter: hardcoded "Save export failed" unlocalized — low, deferred (engine errors dynamic English anyway; needs error-copy spec).
- Blind hunter: date validated after bridge+zip — low, patched (early validation before requestSaves).
- Blind hunter: triggerDownload missing guards/no try-finally — low, patched (try/finally; empty-filename/body guards rejected as unreachable states).
- Blind hunter: missing timer/ref coverage — maybe-false, deferred (implementation-detail tests; no jsdom harness).
- Blind hunter: .gitignore negation ineffective — medium, deferred (pre-existing local content, not this change).
- Blind hunter: shadow/motion/aria-busy vs DESIGN.md — low, partially patched (aria-busy added; chrome tokens pre-existing).
