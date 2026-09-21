---
title: 'Story 7.1: Engine Boot Failure Classification & Localized Recovery Surface'
type: 'feature'
created: '2026-09-21'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '15b305d249418aac67b401e67703ed3a4f5aeeaa'
context:
  - '_bmad-output/specs/spec-ropoductions-web/engine-browser-compat.md'
  - '_bmad-output/implementation-artifacts/epic-7-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A genuine boot failure on `/play` leaves the player on the engine's raw screen (`Error: Your browser does not support WebGL.`, `Your browser does not allow to read local files.`, `#errorPrinter`) or behind the game-owned `Image: <url> has failed to load.` alert, with no cause, no remediation and no reportable detail (epic-7 brief defects D2/D3/D4).

**Approach:** Classify every player-visible boot failure into the five `engine-browser-compat.md` §1 classes, report in-document failures to `/play` over the existing `ROPODUCTIONS_` postMessage channel, probe WebGL in the parent before the engine document is mounted, and render the host's own localized recovery surface — class copy, remediation, raw diagnostic detail, copy-to-clipboard, one retry.

## Boundaries & Constraints

**Always:** the five classes (`webgl_unavailable`, `browser_capability`, `boot_request_failed`, `asset_load_failed`, `renderer_init_failed`) and their raw-string mapping are the classification contract; `renderer_init_failed` renders `webgl_unavailable` player copy; MZ's error screen and the upstream image-guard alert are never the only player-facing outcome; reports travel the save bridge's channel with `event.origin === window.location.origin` plus `event.source === window.parent` (engine) / `=== iframe.contentWindow` (host) — no second channel, no relaxed origin; retry never creates a second iframe element and never issues a load while one is in flight (in-place `contentWindow.location.reload()`; `src` is set at most once for a never-loaded frame); at most one additional engine load per activation; new strings ship in EN, ES, JA, PL, RU, ZH under the `game` namespace with leaf-key parity and a screen-reader path; design spine holds — `card` surface, `rounded-xl` (never `rounded-lg`), `ring-2 ring-primary ring-offset-2 ring-offset-background`, `transition-colors duration-150`, `motion-reduce:transition-none`, Lucide icons only, 44x44px targets, `role="alert"` on the message text, mono `tabular-nums` only inside the diagnostics block; a plugin edit regenerates `src/lib/engine-mock.generated.ts` so the byte-identity test passes.

**Never:** canvas or software-renderer fallback; session, tier or paywall logic changes; telemetry endpoint or server-side report storage; a second postMessage channel; retrying `401`/`403`; remounting the iframe on retry; touching the deferred `/play` double-validation item; deferring the preflight until after the engine mounts.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Preflight refuses WebGL | parent probe `getContext('webgl')` → null, `webglcontextcreationerror` fired | engine document never requested; `webgl_unavailable` panel with raw statusMessage, renderer/vendor, remediation list, retry | probe context released via `WEBGL_lose_context`; no context retained |
| MZ capability screen | `Graphics.printError('Your browser does not support Web Audio API.')` | plugin classifies `browser_capability`, posts report, hides `#errorPrinter`; host panel replaces the engine screen | unclassifiable raw string → `boot_request_failed` with the raw text in diagnostics |
| Engine asset/script load error | capture-phase `error` for a script/img target inside the engine document | `asset_load_failed` with the failing URL, reported once per URL; 7.4 adds the retry budget, the URL is named either way | missing asset still surfaces as a host report, never only the upstream alert |
| Boot script unreachable | iframe `load` fired, no readiness report, probe fetch of the boot script rejects | `boot_request_failed` panel naming URL + network error + that one host retry already happened | probe HTTP status ≥400 → `asset_load_failed` with status; 2xx but no readiness → `boot_request_failed` timeout detail |
| Mock harness | `/engine/index.html` serves `mock-shell.html` (no MZ runtime, no `js/main.js`) | plugin reports readiness from document load; watchdog never probes; no recovery surface | none |
| Player activates retry | panel visible | preflight re-runs; same iframe element reloads in place; panel dismissed; single in-flight load guarded | failed preflight keeps the panel and refreshes diagnostics |
| Foreign report | message from another origin or not from the engine frame | ignored entirely, no state change | none |

</frozen-after-approval>

## Code Map

- `src/types/engine-boot.ts` (new) — message-type constants and report/diagnostics interfaces, mirroring `src/types/save.ts:26-71` discriminated unions.
- `src/lib/engine-boot-failure.ts` (new) — taxonomy table, `classifyEngineBootFailure(raw)`, `playerCopyClass(class)`, `runWebglProbe()` (statusMessage + `WEBGL_debug_renderer_info` vendor/renderer, releases the probe), `isEngineBootFailureReport(value)`, `buildDiagnosticsReport(...)`, `parseEngineBootFailureReport(event, source)`.
- `src/engine-plugins/Ropoductions_WebBridge.js` — add the boot hooks at eval time: wrap `Utils.canUseWebGL` / `SceneManager.checkBrowser` / `Graphics.printError`, capture-phase resource `error` listener, hide `#errorPrinter` after reporting, post `ROPODUCTIONS_ENGINE_READY` (MZ path: boot passed; no-runtime path: document load). Existing save handlers and their checks (`onMessage` :254, origin :255, source :259) stay untouched. Plain JS duplicates the taxonomy across the runtime boundary — same precedent as `getByteLength` (`Ropoductions_WebBridge.js:24-33` vs `src/lib/save-import.ts:69-71`).
- `src/lib/engine-mock.generated.ts` — regenerate with `npm run generate:mock` (`scripts/generate-engine-mock.ts:8-12`); identity assertion `tests/engine-bridge.test.ts:305-325` must pass.
- `src/components/engine-boot-recovery.tsx` (new) — panel; optional `EngineBootRecoveryLabels` props with `useTranslations("game")` fallback, copying `SaveHudDockLabels` (`save-hud-dock.tsx:10-20`, :62-73).
- `src/components/game-viewport.tsx` — preflight gate before the iframe (:246), delete the `key={engineKey}` remount and `handleRetryLoad` (:141-145), listen for reports/ready with the `event.source` check, replace `loadErrorFallback` with the new panel, keep `data-testid="game-engine-iframe"` / `game-viewport-container` contracts.
- `src/locales/*.json` — `game.bootFailure.*` in six dictionaries; parity enforced by `tests/i18n-locales.test.ts:57-86`.
- `tests/engine-boot-failure.test.ts` (new), `tests/engine-bridge.test.ts` (boot-report cases), `tests/game-viewport.test.ts` (superseded source assertions deleted, not re-pinned), `package.json` `test:unit` + `tests/suite-manifest.test.ts:11-17`.

## Tasks & Acceptance

**Execution:**
- [x] `src/types/engine-boot.ts` — define the report vocabulary — one shared shape for plugin and host.
- [x] `src/lib/engine-boot-failure.ts` — implement taxonomy, classifier, WebGL probe, report validator — pure and unit-testable.
- [x] `src/engine-plugins/Ropoductions_WebBridge.js` — detect and report in-document failures, suppress `#errorPrinter`, post readiness.
- [x] `src/lib/engine-mock.generated.ts` — regenerate after the plugin change — keep the single-source identity test green.
- [x] `src/components/engine-boot-recovery.tsx` and `src/components/game-viewport.tsx` — preflight, watchdog, in-place retry, localized panel.
- [x] `src/locales/*.json` — six-locale copy for every class plus controls.
- [x] `tests/engine-boot-failure.test.ts`, `tests/engine-bridge.test.ts`, `tests/game-viewport.test.ts`, `package.json` — cover the matrix rows and register the new suite.

**Acceptance Criteria:**
- Given any raw string in `engine-browser-compat.md` §1, when classified, then it yields exactly its class and `renderer_init_failed` renders `webgl_unavailable` copy.
- Given WebGL refused in the parent, when `/play` mounts, then no engine document request is issued and the panel carries the probe's statusMessage, renderer and vendor.
- Given a failure inside the engine document, when it is reported, then it arrives over `ROPODUCTIONS_` with origin and `event.source` checks, and a foreign-origin or foreign-source message changes no state.
- Given the retry affordance, when activated while a load is in flight, then no second engine document is created and the iframe element is identical before and after.
- Given the mock harness on `/play`, when the engine boots, then no recovery surface appears.

## Implementation Notes

## Spec Change Log

- 2026-09-21 — boot-window scope recorded here and in decision 7 of the handoff (the frozen Intent/Boundaries block is human-owned, so it is left untouched): the plugin stops reporting failures once readiness is posted and the host ignores failure reports received after ready. Without it, MZ's catch-all `Graphics.printError` hook would report a mid-game uncaught error as `boot_request_failed` and replace a running game with the boot panel.
- 2026-09-21 — loading-overlay gate: the iframe `load` event still clears the overlay and marks the engine interactive, as before this story, while the explicit `ROPODUCTIONS_ENGINE_READY` report is the boundary that closes the boot window and cancels the watchdog. Gating the overlay on the ready report alone would strand the overlay forever on any shell synced before this protocol existed (the shell reaches R2 on its own schedule), and the report-suppression rule plus the plugin's own stop-after-ready already keep a mid-game error out of the panel.
- 2026-09-21 — `eslint.config.mjs` gains `.wrangler/**` in its global ignores. Not a story deliverable: the story's own verification sequence runs `npm run test:e2e` (whose `e2e:setup` step drives `wrangler`) before `npm run lint`, and the bundled worker output wrangler leaves in `.wrangler/tmp` made `eslint .` exhaust the heap. Verified: lint exits 0 with `.wrangler` present and exits 134 without the ignore entry.
- 2026-09-21 — watchdog resolution of the matrix row "Boot script unreachable": the frozen matrix lists `boot_request_failed` timeout detail for a 2xx boot-script probe with no readiness, and handoff decision 4 says 2xx means no panel. Implemented as decision 4 (no panel on a reachable boot script): a healthy boot script means the engine is still booting, and the watchdog must not conclude a failure from silence alone. Real failures still surface — `#errorPrinter` text, a failed probe, or an in-document report.

## Review Triage Log

## Design Notes

Player copy, English source (translations ship in all six locales; identifiers such as `webglcontextcreationerror` and renderer strings live only in the mono diagnostics block, never in headline copy):

| Class | Title | Body / remediation |
|---|---|---|
| `webgl_unavailable` (also `renderer_init_failed`) | "3D graphics are unavailable" | "This browser session could not start hardware-accelerated graphics. Turn on hardware acceleration in your browser settings, restart the browser, then try again." |
| `browser_capability` | "This browser is missing a required feature" | "The game needs Web Audio, font loading and storage support. Update your browser or try another one, then try again." |
| `boot_request_failed` | "The game files did not finish loading" | "A request for a game file did not complete. Check your connection, then try again." |
| `asset_load_failed` | "A game asset failed to load" | "One of the game's files could not be loaded. Try again; if it keeps failing, copy the details and send them to the studio." |

Controls: `bootFailure.retry` ("Try again"), `bootFailure.diagnosticsToggle` ("Technical details"), `bootFailure.copyDiagnostics` ("Copy details"), `bootFailure.copied` ("Copied"). Diagnostics rows are labelled: failing URL, response status or network error, WebGL probe results, `webglcontextcreationerror` status message, renderer, vendor, user agent, engine script inventory — the last flagging any script not served from our own origin, the signal for an intermediary rewriting or deferring engine scripts.

## Verification

**Commands:**
- `npm run test:unit` — expected: every suite passes, including `tests/suite-manifest.test.ts` for the new file.
- `npm run lint` — expected: no errors.
- `npm run build` — expected: OpenNext build succeeds (`prebuild` regenerates the engine mock).
- `npm run test:e2e` — expected: existing Chromium specs pass against the mock harness with no recovery surface.
