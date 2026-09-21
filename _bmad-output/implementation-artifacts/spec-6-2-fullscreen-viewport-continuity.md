---
title: 'Story 6.2: Fullscreen Viewport Continuity (Single-Tree GameViewport)'
type: 'bugfix'
created: '2026-09-21'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/planning-artifacts/analytics/analytics-epic-6-2026-09-21.md'
  - '_bmad-output/planning-artifacts/architecture/architecture-ropoductions-web-2026-09-15/ARCHITECTURE-SPINE.md'
  - '_bmad-output/specs/spec-ropoductions-web/save-and-runtime-contract.md'
  - '_bmad-output/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Story statement:** Make fullscreen a pure layout change: `GameViewport` renders exactly one DOM tree in both windowed and fullscreen modes, switching only class names, so the engine iframe is never unmounted, moved, or reloaded across a fullscreen enter/exit — live in-game progress survives the toggle.

**Problem (defect D2, measured):** `src/components/game-viewport.tsx` returns two structurally different JSX trees — `if (activeFullscreen) { return (…) }` at `:301-356` versus the windowed return at `:358-395`. The shared `engineFrame` element (`:244-257`) sits at a different nesting depth in each branch (windowed: `container > wrapper > inner > iframe`; fullscreen: `container > wrapper > iframe`), so React unmounts the old subtree and mounts a fresh iframe on every toggle; the browser reloads `/engine/index.html` and RPG Maker MZ boots back to its title screen, destroying in-memory progress. Experiment record (Chromium 153 / React 19.2.8, decision record §3): the two-branch variant shows engine `load` events `1 → 2 → 3` across enter→exit with iframe node identity changing and 2 DOM moves per toggle; the single stable-tree variant shows `load` count `1 → 1 → 1`, identical node identity, 0 mutations. Promoting an ancestor into the top layer via `requestFullscreen()` was measured not to reload a child iframe — browser behaviour is excluded; the defect is entirely host-side reconciliation. Secondary effect, same cause: the `SaveHudDock` wrapper is recreated on every toggle, resetting its idle-dim timer and any in-flight export state.

**Approach:**
1. Collapse `GameViewport`'s two return statements into one tree whose container children array is constant — `[stage, dockArea, fabSlot, importDialog, resetDialog]` — with the iframe's ancestor chain identical in both modes and only class names switching per mode (including the pinned strings `fixed inset-0 z-40` and `rounded-none border-0` on the fullscreen container state, per `tests/game-viewport.test.ts:95-96`).
2. Collapse the `portalElement` effect (`src/components/game-viewport.tsx:176-178`) to `useEffect(() => setPortalElement(containerRef.current), [])`: the `[isFullscreen, isPseudoFullscreen]` dependencies exist only because the container node used to be re-created; in a single tree it never is.
3. Keep `key={engineKey}` as the only key on the iframe (retry-load semantics unchanged), and keep both Radix dialogs on `container={portalElement}` at stable positions in the tree.
4. Replace the branch-structure unit assertions with single-tree invariants, and add the e2e regression: engine boot count stays exactly 1 across fullscreen enter→exit driven through the real `GameViewport` on `/play` with the mock shell (decision record §8: pre-fix the same test must show 2).

## Acceptance Criteria

- **Given** a running game on `/play` **When** the user enters fullscreen via the dock control and then exits fullscreen (native or pseudo path) **Then** the engine iframe DOM node is never unmounted and never moved: the number of engine `load` events observed across the whole enter→exit cycle is exactly 1 (e2e assertion; pre-fix the identical run reports 2 or more).
- **Given** the same cycle **When** React reconciles the viewport **Then** a MutationObserver on the iframe node records zero mutations on it, and iframe node identity is unchanged before, during, and after both toggles.
- **Given** the component source **When** the structure tests run **Then** `GameViewport` contains exactly one top-level returned tree (no `if (activeFullscreen)` return), its children array is constant `[stage, dockArea, fabSlot, importDialog, resetDialog]`, and the only mode-dependent values are class-name strings.
- **Given** fullscreen and windowed modes **When** each renders **Then** the visual result matches today's layout contract (container `fixed inset-0 z-40` + `rounded-none border-0` in fullscreen, `aspect-[16/9]` rounded bordered card in windowed) — no styling regression, and no browser top-layer special handling is introduced.
- **Given** the dialogs **When** fullscreen is entered or exited **Then** `SaveImportDialog`/`SaveResetDialog` keep `container={portalElement}` and `portalElement` is set once by an effect with an empty dependency array; opening a dialog in either mode renders it into the viewport container.
- **Given** the secondary D2 effect **When** fullscreen is toggled **Then** the `SaveHudDock` element is reconciled in place (same node), preserving its idle-dim timer across the toggle.
- **Given** an in-game state (mock shell holding a runtime value) **When** the owner repro runs — start play, enter fullscreen, exit fullscreen **Then** the game is still at the same screen; no return to the title screen.

</frozen-after-approval>

## Files

- `src/components/game-viewport.tsx` — merge the two returns (`:301-356` fullscreen branch deleted as a branch; `:358-395` windowed return becomes the single return); mode-conditional class strings on `container`, `stage`, `dockArea`, `fabSlot`; `handleFullscreenChange` (`:48-89`) keeps its state transitions, including the exit-branch `setIsHudCollapsed(false)` reset at `:67-70` — that reset's removal belongs to Story 6.3 and MUST NOT be made here; `portalElement` effect at `:176-178` → empty deps.
- `tests/game-viewport.test.ts` — rewrite the structural assertions (Tests section); the iframe sandbox/allow-list pins (`:38-62`), 16:9 pins (`:64-73`), loading/error pins (`:153-163`), and the WebKit-prefix/fullscreen-event pins (`:75-103`) stay semantically unchanged.
- `e2e/fullscreen-continuity.spec.ts` — new spec file (boot-count regression; also the natural home for 6.3's "dock hidden on fullscreen entry" case once 6.2 lands).
- `playwright.config.ts` — no expected change; the new spec joins the existing run (register in `tests/suite-manifest.test.ts` scope only if a new unit file is added; e2e files are auto-discovered by `testDir`).
- Engine side untouched: `src/engine-plugins/Ropoductions_WebBridge.js`, `src/engine-plugins/mock-shell.html`, `src/app/engine/[...path]/route.ts` contain no fullscreen/resize handling and need no change (decision record §3: "engine side is clean").

## Contracts

- Single-tree invariant: `GameViewport` returns one tree; its root container's children array is exactly, in order, `[stage, dockArea, fabSlot, importDialog, resetDialog]` in both modes — conditional *content* inside a slot may toggle (`fabSlot` renders `null` while windowed, matching today), but the slot elements themselves and the iframe's ancestor chain never change shape.
- Mode switch is class-name-only:
  - container: windowed `relative w-auto h-full max-h-full max-w-full flex flex-col … ${className}` ⇄ fullscreen `fixed inset-0 z-40 w-screen h-dvh … rounded-none border-0 bg-black …` (the pinned strings `fixed inset-0 z-40` and `rounded-none border-0` from `tests/game-viewport.test.ts:95-96` must remain present in source).
  - `data-testid="game-viewport-container"` and `data-fullscreen={activeFullscreen ? "true" : "false"}` remain single instances on the one container.
- iframe: exactly one `<iframe>` element with `key={engineKey}` (`:246`) — the only `key` on the frame path; `onLoad={handleIframeLoad}` unchanged so `handleIframeLoad` fires once per genuine load.
- portals: `useEffect(() => { setPortalElement(containerRef.current); }, [])`; `SaveImportDialog` and `SaveResetDialog` keep `container={portalElement}`.
- No change to `toggleFullscreen` (`:180-240`) native/webkit/pseudo flow, `activeFullscreen = isFullscreen || isPseudoFullscreen` (`:242`), or the Escape-handler dialog guard (`:95`).
- Depends on Story 6.1 having landed (merged `develop`): the `/play` e2e session helper `e2e/helpers/session.ts` from 6.1 is reused to reach an authenticated `/play`.

## Tests

New/changed assertions in `tests/game-viewport.test.ts` (source-structure style, `readSource` precedent at `:8`):
- `fails pre-fix`: `it("renders a single tree in both modes (no second return)")` — asserts `!src.includes("if (activeFullscreen) {")`; fails on current `develop` (`:301`).
- `fails pre-fix`: `it("sets the dialog portal container once with a stable tree")` — asserts the portalElement effect reads `}, []);`; fails on current `[isFullscreen, isPseudoFullscreen]` deps (`:178`).
- New: single `engineFrame` mount site (`(src.match(/<iframe/g) ?? []).length === 1`), constant children-slot order assertion, and one-container assertion (`data-testid="game-viewport-container"` occurs once, not twice).
- **Pinned assertions that change (file + name):**
  - `tests/game-viewport.test.ts` → `it("renders the dock as a static sibling in standard layout and overlays it only in fullscreen")` — rewritten, not deleted, to assert the single-tree contract: the `dockArea` slot exists in one place with mode-toggled classes (windowed static sibling ⇄ fullscreen `absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-20 pointer-events-none`), FAB conditionally rendered inside its constant slot, and the existing `isHudCollapsed` / `save-hud-collapse-fab` / `aria-expanded={!isHudCollapsed}` / `aria-controls={hudId}` / `h-11 w-11` / `[role="dialog"][data-state="open"]` substring pins retained.
  - `it("manages fullscreen state with WebKit prefix fallbacks and delegates toggle to SaveHudDock")` — kept as-is; the merged tree must keep every substring it pins (notably `fixed inset-0 z-40`, `rounded-none border-0`, `currentFsElem === containerRef.current`), which is the class-string survival constraint for this rewrite.
- Existing suites that must stay green untouched: `tests/save-hud-dock.test.ts` (all), `tests/design-motion-fixes.test.ts` (no `transition-all`/`animate-in` in the merged source), `tests/engine-bridge.test.ts`, `tests/save-bridge.test.ts`.

E2e `e2e/fullscreen-continuity.spec.ts` (requires the 6.1 session helper + authenticated `/play`; Chromium, native `requestFullscreen` available):
- `engine boots exactly once across fullscreen enter->exit` — counts frame `load` events via `page.on("framenavigated")`/injected counter while toggling through the real dock button (`[data-testid="save-hud-fullscreen-button fullscreen-toggle-button"]`); expects exactly 1; **the same test run against pre-fix `develop` reports 2** (decision record §8).
- `iframe node identity survives fullscreen enter->exit` — MutationObserver on the iframe subtree + node handle across toggles records 0 mutations on the iframe node.
- `game state survives fullscreen enter->exit` — drives the mock shell to a non-title state, toggles fullscreen both ways, asserts the state (and its screen marker) persists.

## Out of scope

- The fullscreen dock **collapsed-by-default** behaviour and the exit-reset removal on `isHudCollapsed` — Story 6.3 owns those state semantics; 6.2 changes tree shape only.
- Any engine-side fullscreen/resize/visibility handling (ruled out by measurement), top-layer tricks, `requestFullscreen` option usage, or `key={engineKey}` semantics (retry-load stays).
- Visual redesign of either mode; pseudo-fullscreen fallback flow; 6.1's admin entry; save/export/import/reset logic.
- The `public/engine/**` stale-mirror docs item (decision record §6.3 — reconciliation, not Epic 6).

## Verification

1. `npm run test:unit` — includes the rewritten `tests/game-viewport.test.ts`.
2. `npx tsc --noEmit`
3. `npm test`
4. `npm run build`
Plus, before the PR: `npm run test:e2e` — the new `e2e/fullscreen-continuity.spec.ts` passes, and the pre-fix control run (same spec against the base commit without the merge) demonstrates the 2-boot failure; all existing e2e specs stay green; zero conflicts against `origin/develop`.
