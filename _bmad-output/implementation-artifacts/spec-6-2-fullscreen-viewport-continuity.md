---
title: 'Story 6.2: Fullscreen Viewport Continuity (Single-Tree GameViewport)'
type: 'bugfix'
created: '2026-09-21'
status: 'review'
route: 'dispatch'
review_loop_iteration: 1
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

## Review Triage Log

Layers run 2026-09-22 against the branch diff (`fix/6-2-fullscreen-viewport-continuity`, cut from `origin/develop` @ 1e6d4bd): a remount-mechanism audit, a layout-equivalence analysis, a diff-correctness review, and a verification-gap review. Verdicts are the orchestrator's, checked against the branch before acceptance.

| # | Finding (layer) | Verdict | Evidence and route |
|---|---|---|---|
| 1 | Divergent returns are the only mechanism that unmounts/recreates the frame; every other candidate (frameSrc writes, retry/error chains, dock conditional, Radix portals, `portalElement` transitions, keys) is either not toggle-reachable or swaps only slots positioned after the frame (remount audit) | `confirmed` | React 19 reconciles the reused root div by child index: fullscreen `container > stage > iframe` vs windowed `container > card > inner > iframe` put `IFRAME` against `DIV` → type mismatch. Post-fix measured: load events 1 (was 1 → 3), 0 frame mutations (was 4). |
| 2 | Sibling index shuffle also remounted the dock and FAB and cross-remounted the two dialogs on every toggle (remount audit, second-order defect) | `fixed` | The constant slot array removes the index shuffle; the e2e identity test asserts the `save-hud-dock` node survives the toggle, so the dock's idle-dim timer and in-flight export state are no longer reset. |
| 3 | Windowed mode in width-clamped (portrait/tall) viewports: merging today's outer card and inner 16:9 wrapper into one element means the iframe element box stops being a true-16:9 letterbox; the game is then letterboxed by the engine's own `object-fit: contain` instead of by the host (layout analysis) | `accepted, measured` | Pre/post painted game rects measured on the built worker at 390x844 — windowed 371.6x209 at y=312.4 (pre) vs 372x209 at y=311.4 (post): the painted game area is preserved within 1px. The delta is which box owns the black letterbox band, not what the player sees. Unavoidable for a single stage element; the spec's `[stage, dockArea, fabSlot, importDialog, resetDialog]` contract forbids the extra wrapper that would remove it. |
| 4 | The premise that merging would newly clip the iframe corners is wrong: `rounded-xl` and `overflow-hidden` already sit on the same element in the windowed card, so corners are already clipped (layout analysis) | `false premise, corrected` | `git show origin/develop:src/components/game-viewport.tsx` windowed card carries both tokens on one element; the merge introduces no clipping change. |
| 5 | New e2e helpers carried WHAT-only comments, against the strict WHY-only comment rule (diff review) | `fixed` | All three rewritten as rationale (why a capture listener, why positional reconciliation shows up as add/remove, why the path is recorded). |
| 6 | `{engineFrame}`/`<iframe` count and the `activeFullscreen` presence assertions passed on the base revision, so they were not red-first (diff review) | `fixed` | Replaced by a single discriminating assertion — `{engineFrame}` must be placed exactly once (base: 2, head: 1). The non-discriminating `activeFullscreen` presence check was dropped. |
| 7 | The dock-placement assertions passed on the base revision because both class strings already existed in the two separate returns (diff review) | `fixed` | Rewritten to scope both class strings to the single `const dockArea` declaration (base: no such declaration; head: present, both strings inside it), which also proves one slot carries both modes. |
| 8 | A fixed 250 ms settle cannot prove "no later remount": a delayed remount or reload after the reads escapes all three tests (verification-gap review) | `fixed, residual accepted` | The sleep is gone. The engine document is pulsed with real input after the toggle (a real round-trip that also proves the document still answers input), the load counter was added to the state test and asserted last, and the mutation observer runs continuously. Residual: any "never happened" assertion is bounded by its observation window; the counters are continuous, only the final read is bounded. |
| 9 | `performance.getEntriesByType("navigation").length` resets to 1 across a reload, so the assertion was tautological (verification-gap review) | `fixed` | Deleted; the in-document runtime marker, `performance.timeOrigin` and the load count carry the reload signal. |
| 10 | Spec defects: the Problem and Files sections cite line numbers from a pre-Epic-7 revision (`:301`/`:358`/`:176-178`/`:244-257`/`:48-89`; actual `:686`/`:745`/`:572-574`/`:640-654`/`:378-411`), and Approach 3 plus the Contracts require `key={engineKey}` — no such binding exists anywhere in the repository | `corrected, not implemented` | `grep` for `engineKey` finds nothing (only an unrelated `key={locKey}` in `language-switcher.tsx`). Adding a key would be a remount-inducing key change, which AD-11 forbids. The single-tree requirement is met without it; `handleRetryLoad` keeps its existing imperative retry semantics. |

## Deviations from the frozen spec

1. **`key={engineKey}` not added** (triage #10): the frozen Contracts clause describes a binding that does not exist in the codebase; the invariant it protects (no remount-inducing key on the frame path) is satisfied by having no key at all.
2. **The windowed stage merges two pre-existing elements** into one: the frozen contract's `[stage, dockArea, fabSlot, importDialog, resetDialog]` slot array permits exactly one stage element, so today's outer card and inner 16:9 wrapper become one mode-switched element. This is the source of the accepted portrait delta in triage #3.
3. **Painted-area measurement added to the verification** beyond the frozen list: the AC "no styling regression" is proven on the built worker by comparing the painted game rect before and after, because the iframe element box legitimately changes in the portrait case.
