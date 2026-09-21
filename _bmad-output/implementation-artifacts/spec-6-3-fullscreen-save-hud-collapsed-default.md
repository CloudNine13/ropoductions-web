---
title: 'Story 6.3: Fullscreen Save HUD Collapsed Default (Fullscreen-Only Collapse)'
type: 'bugfix'
created: '2026-09-21'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/planning-artifacts/analytics/analytics-epic-6-2026-09-21.md'
  - '_bmad-output/planning-artifacts/ux-designs/ux-ropoductions-web-2026-09-15/DESIGN.md'
  - '_bmad-output/planning-artifacts/ux-designs/ux-ropoductions-web-2026-09-15/EXPERIENCE.md'
  - '_bmad-output/specs/spec-ropoductions-web/save-and-runtime-contract.md'
  - '_bmad-output/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Story statement:** In fullscreen the game is unobstructed by default: the save dock starts collapsed behind its existing 44px affordance, expands only on explicit user action, and re-collapses when the chrome sits idle; the windowed dock keeps today's dim-only behaviour unchanged (owner decision Q13).

**Problem (defect D3, decision record §4):** `src/components/save-hud-dock.tsx` always renders its four `role="toolbar"` buttons; idle behaviour is chrome-only dim after `DEFAULT_IDLE_TIMEOUT_MS = 4000` (`:35`, `data-dimmed`), and buttons never hide. In fullscreen the viewport additionally **re-opens** the dock on every exit — `handleFullscreenChange` resets `setIsHudCollapsed(false)` on exit (`src/components/game-viewport.tsx:67-70`) — so the fullscreen overlay is covered by chrome immediately on entry. This contradicted the pre-Epic-6 `DESIGN.md` §3 text ("Fullscreen overlay defaults expanded; collapse is user-invoked only and resets on fullscreen exit"); the owner's Q13 decision reverses that default, and the dated DESIGN/EXPERIENCE amendments are part of the Epic 6 docs PR, not this story's branch.

**Approach:**
1. Move the collapsed state into `SaveHudDock`: a new `collapsed` prop removes the toolbar from layout with the `hidden` class (display removal — never `opacity-*`) while the element stays permanently rendered; the toolbar is never unmounted by the viewport's `{!isHudCollapsed && …}` conditional again.
2. `game-viewport.tsx` collapses on fullscreen entry and stops resetting `isHudCollapsed` on exit; the existing `save-hud-collapse-fab` (44px, `h-11 w-11`, label `game.saveHudToggleControls`, already in six locales) remains the only expand/collapse affordance and is a **sibling** of the toolbar, never a descendant.
3. The 4s dim constant `DEFAULT_IDLE_TIMEOUT_MS` stays as-is for windowed chrome; the fullscreen idle re-collapse threshold is a second, independent constant (`DEFAULT_HUD_RECOLLAPSE_MS`, exported alongside it) measured as the delay *after* the dim rung elapses, so total idle before a fullscreen collapse is 4s dim + 8s = 12s.
4. Invariants: canvas and bridge activity never restore chrome (they only un-dim an already-expanded dock); an in-flight export and an open dialog hold the expanded state.
5. e2e: the dock is hidden (zero layout) on fullscreen entry; unit: the full collapse state machine.

## Acceptance Criteria

- **Given** a patron enters fullscreen (native or pseudo) **When** the overlay renders **Then** the save toolbar is collapsed: its `role="toolbar"]` node carries the `hidden` class (removes layout; `isVisible()` false), the `save-hud-collapse-fab` is visible with `aria-expanded="false"`, and no chrome covers the canvas by default.
- **Given** a windowed session **When** any time elapses **Then** the dock is never collapsed — today's dim-only behaviour (`data-dimmed` after 4s chrome idle) is byte-for-byte the observable contract in windowed mode (Q13).
- **Given** a collapsed fullscreen dock **When** the user activates the FAB **Then** the toolbar un-hides with `aria-expanded="true"`, and activation is keyboard-reachable with the canonical focus ring (no save action becomes unreachable).
- **Given** an expanded fullscreen dock **When** gameplay continues — canvas input and same-origin `ROPODUCTIONS_ACTIVITY` bridge messages **Then** the chrome does not re-expand from a collapsed state, and activity never cancels the pending re-collapse of an expanded dock beyond resetting its own idle threshold (canvas/bridge activity does not restore chrome).
- **Given** an expanded fullscreen dock **When** the chrome sits idle past the dim rung for `DEFAULT_HUD_RECOLLAPSE_MS` (12s total idle: the 4s dim rung plus the 8s re-collapse delay) **Then** the dock re-collapses (display removal; FAB `aria-expanded="false"`); any explicit chrome interaction (pointer/hover/focus/tap on the dock or FAB) restarts the threshold.
- **Given** an export in flight (`data-export-status="exporting"`) **or** a Radix dialog open (`[role="dialog"][data-state="open"]`) **When** the re-collapse threshold elapses **Then** the dock stays expanded; the collapse fires only after the export settles and dialogs close.
- **Given** the user exits fullscreen with the dock collapsed **When** they later re-enter fullscreen **Then** the dock is collapsed again on entry, and windowed mode shows the dock expanded (no collapse leaks into windowed chrome); the old exit-reset of `isHudCollapsed` is gone, not inverted into a leak.
- **Given** the collapsed toolbar **When** the collapse affordance is needed **Then** the FAB is a sibling of the `role="toolbar"` node inside the viewport, never a descendant — display removal of the toolbar must never hide the handle that restores it (lock-down invariant, pinned by a named test).
- **Given** any collapse state **When** the dock renders **Then** no `opacity-*` class is ever used for collapse or dim toggling (existing dim contract in `tests/save-hud-dock.test.ts` — "dims chrome only … never drops below AA contrast" — stays green and extends to collapse).

</frozen-after-approval>

## Files

- `src/components/save-hud-dock.tsx` — add `collapsed?: boolean` to `SaveHudDockProps` (`:22-33`); apply `hidden` (plus `data-collapsed={collapsed ? "true" : "false"}` for queryability) to the toolbar root element (`:221-238` region, `data-testid="save-hud-dock"`); export `DEFAULT_HUD_RECOLLAPSE_MS` next to `DEFAULT_IDLE_TIMEOUT_MS` (`:35`); drive the re-collapse timer from chrome-level interaction state only.
- `src/components/game-viewport.tsx` — render `<SaveHudDock … collapsed={activeFullscreen && isHudCollapsed} />` permanently in the fullscreen `dockArea` (replace the `{!isHudCollapsed && …}` conditional mount, now inside the 6.2 single tree, `:314-325`); set `setIsHudCollapsed(true)` on fullscreen entry; delete the exit reset at `:67-70` (and the matching resets in the pseudo-fullscreen Escape path `:100` and the toggleFullscreen pseudo/native exit branches `:201`, `:238` — replaced by entry-time collapse, per Q13/Q5(b)); the FAB (`:326-341`, `data-testid="save-hud-collapse-fab"`) stays in its `fabSlot`, toggling the same `isHudCollapsed`.
- `tests/game-viewport.test.ts` — collapse-lifecycle assertions (Tests section); 6.2's rewritten structure test is extended, not replaced.
- `tests/save-hud-dock.test.ts` — new `it` blocks in the "Save HUD Dock behavioral state machine and lifecycle" describe (`:214-499`, harness precedent `createDockHarness` at `:262`) for collapsed semantics and the re-collapse threshold.
- `e2e/fullscreen-continuity.spec.ts` (created by 6.2; this story appends) — `dock is collapsed on fullscreen entry`.
- No new locale keys; `game.saveHudToggleControls` (existing, six locales) remains the FAB's `aria-label`/`title`. `tests/i18n-locales.test.ts` untouched and green.

## Contracts

```ts
// src/components/save-hud-dock.tsx
export const DEFAULT_IDLE_TIMEOUT_MS = 4000;        // unchanged: windowed chrome dim threshold
export const DEFAULT_HUD_RECOLLAPSE_MS = 8000;      // NEW, independent constant: idle time AFTER the dim rung elapses
                                                    // (total fullscreen idle before collapse = DEFAULT_IDLE_TIMEOUT_MS + this = 12s)

export interface SaveHudDockProps {
  // … existing props unchanged …
  collapsed?: boolean;          // default false; true => toolbar gets `hidden` (display removal), node stays mounted
  onActivityOutside?: never;    // NOT added — activity wiring stays internal
}
```

- Collapse is **display removal on a permanently-rendered node**: class `hidden` toggled by `collapsed`; never `opacity-*`, never conditional unmount (`!isHudCollapsed && <SaveHudDock/>` is retired from the viewport).
- Viewport state rule: `isHudCollapsed` starts `true` when entering either fullscreen mode (native success or pseudo fallback), is toggled only by the FAB, re-collapses via the dock's re-collapse timer, and is **never** reset by fullscreen exit paths.
- Re-collapse timer (dock-internal): armed while `collapsed === false && isFullscreen === true`; (re)started by pointer-enter/hover, focus, tap, and button activation inside the toolbar or FAB; **not** armed, reset, or cancelled by `pointerdown/keydown/wheel` window activity or `HUD_ACTIVITY_MESSAGE_TYPE` bridge messages except when they land on chrome elements; suppressed while `currentExportStatus === "exporting"` and while `document.querySelector('[role="dialog"][data-state="open"]')` is non-null (same dialog-guard idiom already pinned at `tests/game-viewport.test.ts:147-150`); on elapse it calls an internal collapse request that surfaces to the viewport's `isHudCollapsed` (prop callback `onRequestCollapse?: () => void` on `SaveHudDockProps` if the timer stays dock-side — either placement is acceptable as long as the observable contract holds and `collapsed` remains viewport-owned single source of truth).
- FAB aria contract (already pinned): `aria-expanded={!isHudCollapsed}`, `aria-controls={hudId}`, `h-11 w-11`, label `t("saveHudToggleControls")` — unchanged; windowed mode never renders the FAB (unchanged).
- Structural invariant: the `save-hud-collapse-fab` element must be a DOM sibling (inside `fabSlot`) of the `role="toolbar"` element, never nested within it or its wrapper, so `hidden` on the toolbar cannot hide the affordance that reverses it.

## Tests

`tests/save-hud-dock.test.ts` (harness-simulation style):
- `fails pre-fix`: `it("collapses by display removal, never opacity or unmount")` — source pins: `save-hud-dock.tsx` contains `collapsed` + `hidden` + `data-collapsed`, and `game-viewport.tsx` no longer gates the `SaveHudDock` mount on `!isHudCollapsed`; both fail on current `develop`.
- `fails pre-fix`: `it("re-collapse threshold is a second constant independent of the 4s dim")` — asserts `DEFAULT_HUD_RECOLLAPSE_MS` is exported and is a distinct binding from `DEFAULT_IDLE_TIMEOUT_MS`; changing the dim value must not move the collapse value (harness: two harnesses configured with one value each).
- New: `it("canvas and bridge activity never restores collapsed chrome")` — harness: dispatch window `pointerdown`/`keydown` and same-origin `ROPODUCTIONS_ACTIVITY` while collapsed; collapsed stays collapsed; while expanded, identical events do not restart the re-collapse timer (dim may reset; collapse may not).
- New: `it("export in flight and open dialogs hold the expansion")` — with `exportStatus="exporting"` (controlled) or a stubbed open `[role="dialog"][data-state="open"]` node, advancing past the re-collapse threshold keeps the dock expanded; after settling, the next idle elapse collapses.
- Existing pins that stay untouched: `exports SaveHudDock component and DEFAULT_IDLE_TIMEOUT_MS constant` (`:15-20` — must still see the 4000 dim export; the new export is additive), `dims chrome only…` (`:34-51`), `restores full opacity immediately on dock hover, focus, or tap without touch latching` (`:92-104`), `mounts SaveHudDock inside GameViewport at bottom…` (`:184-211`, incl. the `save-hud-collapse-fab` stable-testid pin), and the whole behavioral describe's existing 8 cases.

`tests/game-viewport.test.ts`:
- `fails pre-fix`: `it("collapses the HUD on fullscreen entry and never on exit")` — source pins: `setIsHudCollapsed(true)` reachable from the fullscreen-entry paths, and no `setIsHudCollapsed(false)` inside the `if (!isOurFs)` exit branch of `handleFullscreenChange` (`:67-70`) or the toggleFullscreen exit branches; pre-fix this is exactly inverted.
- New: `it("keeps the collapse FAB a sibling of the toolbar so collapse cannot hide it")` — asserts, on the merged single tree (6.2 precondition), that the FAB element is emitted outside the element carrying the dock's `hidden` toggle (structure-level check on the JSX: `fabSlot` node is a sibling slot of `dockArea`, and `SaveHudDock`'s collapsed class lands on the toolbar node itself).

E2e (`e2e/fullscreen-continuity.spec.ts` append; needs 6.1's session helper and 6.2's merged tree):
- `dock is collapsed on fullscreen entry` — enter fullscreen through the dock button (the only way: expanded by definition on the entry click), then assert `[data-testid="save-hud-dock"]` has zero bounding box / `hidden` applied, and `[data-testid="save-hud-collapse-fab"]` is visible and keyboard-focusable; activating the FAB reveals the toolbar; pre-fix the toolbar is visible on entry.

## Out of scope

- The tree-shape fix itself (iframe remount, `portalElement` deps) — owned by 6.2; 6.3 assumes the single tree and its constant `[stage, dockArea, fabSlot, importDialog, resetDialog]` slots.
- The admin entry chrome — owned by 6.1.
- Windowed-mode collapse or auto-hide of any kind (explicitly rejected by Q13: windowed keeps dim-only behaviour, and the FR-14 "never ship hidden primary Export action" concern stays satisfied in windowed mode).
- Any change to dim styling tokens, the 4s `DEFAULT_IDLE_TIMEOUT_MS` value, `data-dimmed` semantics, dialog containers, the export/import/reset flows, or locale content.
- The superseded Q5(b) "identical rule windowed + fullscreen" and the pre-amendment DESIGN §3 "defaults expanded … resets on fullscreen exit" text — both are corrected by the dated docs amendments in the Epic 6 docs PR, not by this story.

## Verification

1. `npm run test:unit` — includes the extended `tests/save-hud-dock.test.ts` and `tests/game-viewport.test.ts`.
2. `npx tsc --noEmit`
3. `npm test`
4. `npm run build`
Plus, before the PR: `npm run test:e2e` (the appended dock-default spec plus all existing specs green) and zero conflicts against `origin/develop`.
