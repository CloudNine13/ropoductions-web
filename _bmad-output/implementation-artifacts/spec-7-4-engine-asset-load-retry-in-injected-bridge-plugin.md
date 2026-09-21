---
title: 'Story 7.4: Engine Asset-Load Retry in the Injected Bridge Plugin'
type: 'feature'
created: '2026-09-21'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '57735a7bff0cdad2c37f22f9515b4280f826b0bd'
context:
  - '_bmad-output/specs/spec-ropoductions-web/engine-browser-compat.md'
  - '_bmad-output/implementation-artifacts/epic-7-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** One aborted or 5xx engine asset request costs the player a sprite or the custom cursor: MZ's `Bitmap._onError` (`rmmz_core.js:1838`) parks the bitmap in `error` forever, the shipped image guard's `alert` reports it to nobody useful, and the boot continues broken (epic-7 brief defect D1). The same boot also allocates probe WebGL contexts MZ never releases (`Utils.canUseWebGL`, `rmmz_core.js:294`).

**Approach:** The injected bridge plugin retries a failed engine asset load on the same URL, at most twice, with jittered backoff, inside the boot window; `401`/`403` are never retried and escalate to the host as a session rejection; an exhausted budget reports the URL, the retry count and the request outcome to the Story 7.1 surface. MZ's capability check is answered by the plugin's own probe, which releases the context through `WEBGL_lose_context`.

## Boundaries & Constraints

**Always:** the retry budget is at most 2 attempts per URL per boot; retries reuse the same URL and never create a document, an iframe, or a WebGL context; the plugin re-enters the engine's own loading entry point (`Bitmap._startLoading`) so a successful retry marks the bitmap loaded and the sprite renders; MZ's failure contract (`_loadingState = "error"`) is preserved by the terminal path; `401`/`403` escalate (report with `sessionRejected: true`) and the host answers them with session revalidation; a failure inside a running game stays the engine's own problem (reporting and retrying are boot-window scoped, as in Story 7.1); the plugin source stays byte-identical with its generated mirror.

**Never:** canvas or software-renderer fallback; a second postMessage channel or a relaxed origin/source rule; retrying `401`/`403`, `404`, or any other definitive 4xx; retrying non-GET or cross-origin requests; remounting the iframe; changing session, tier or paywall semantics; adding a telemetry endpoint; touching the deferred `/play` double-validation item.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Image request aborted (network-level) | `Bitmap._onError`, no Resource Timing entry or `responseStatus >= 500` | retry scheduled with jittered backoff on the same URL, bitmap stays `loading`; a success renders the sprite and reports nothing | budget exhausted → `asset_load_failed` report with `url` + `retries` |
| Image answered `401`/`403` | `performance.getEntriesByName(url).responseStatus` is 401/403 | no retry; report carries `sessionRejected: true` + `status` | host revalidates the session by reloading `/play`, which routes an unauthorized session to the paywall |
| Image answered `404` or another 4xx | `responseStatus` 400-499 (not 401/403) | no retry; report carries `status` | terminal: the engine's own failure state stands |
| Data request (`XMLHttpRequest` GET on an engine asset path) fails at the network level or with 5xx | `send()` on a same-origin engine asset URL with `onload`/`onerror` handlers | retried up to twice on the same URL; the engine's own handler is called once with the response it would have seen | exhausted → report with `url`, `retries`, `status` or `networkError`; the engine's handler still runs |
| Data request answered `401`/`403` | response status 401/403 | no retry; report carries `sessionRejected: true` + `status`; the engine still receives the response | as above |
| XHR caller tracks `onreadystatechange` | `onreadystatechange` assigned before `send()` | request passes through untouched | no retry, no report |
| Mid-game asset failure | readiness already posted | native failure path only: no retry, no report | none |
| MZ capability check | `Utils.canUseWebGL()` | answered by the plugin's probe, context released via `WEBGL_lose_context` | refusal → `webgl_unavailable` report carrying `statusMessage` (Story 7.1 path) |

</frozen-after-approval>

## Code Map

- `src/engine-plugins/Ropoductions_WebBridge.js` — retry policy (`RETRY_MAX_ATTEMPTS` 2, 300ms base, 2s ceiling, equal jitter), `isEngineAssetUrl`, `assetFailureKind` (Resource Timing `responseStatus`), `installBitmapRetryHook` (wraps `Bitmap.prototype._startLoading` for element ownership and `_onError` for the failure contract), `installAssetRequestRetryHook` (wraps `XMLHttpRequest.prototype.open`/`send` for same-origin engine asset GETs), `runWebglProbe`/`installWebglProbeHook` (releases the probe context, records statusMessage/renderer/vendor), `finishBitmapFailure` (terminal report + MZ failure state), resource-error hook now skips retry-owned images, `reportBootFailure` accepts a later report for the same URL only when it carries the retry outcome.
- `src/types/engine-boot.ts` — `EngineBootDiagnostics.retries`, `.sessionRejected`.
- `src/lib/engine-boot-failure.ts` — `isSessionRejectedReport`, retry/session diagnostics rows and their labels.
- `src/components/engine-boot-recovery.tsx` — the three new optional label props, wired to `bootFailure.*`.
- `src/components/game-viewport.tsx` — `escalateSessionRevalidation` (once per mount) and the session-rejected branch in the engine message handler.
- `src/locales/*.json` — `game.bootFailure.diagnosticsRetries`, `.diagnosticsSessionRejected`, `.diagnosticsSessionRejectedValue` in six locales.
- `src/lib/engine-mock.generated.ts` — regenerated (`npm run generate:mock`).
- `tests/engine-asset-retry.test.ts` (new, registered in `test:unit`), `tests/engine-boot-failure.test.ts`, `tests/game-viewport.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `src/engine-plugins/Ropoductions_WebBridge.js` — retry policy, bitmap retry, XHR retry, releasing WebGL probe.
- [x] `src/types/engine-boot.ts`, `src/lib/engine-boot-failure.ts`, `src/components/engine-boot-recovery.tsx` — retry/session diagnostics and their rows.
- [x] `src/components/game-viewport.tsx` — session-rejection escalation.
- [x] `src/locales/*.json` — six-locale copy for the new diagnostics rows.
- [x] `src/lib/engine-mock.generated.ts` — regenerated mirror.
- [x] `tests/engine-asset-retry.test.ts` + `package.json` — retry policy suite registered.

**Acceptance Criteria:**
- Given a network-level failure while the engine loads an image or data file, when the retry succeeds, then the sprite or cursor renders without reloading the engine or creating a second engine document.
- Given a `401` or `403` response, when the asset layer sees it, then no retry occurs and the host escalates to session revalidation.
- Given exhausted retries, when the budget runs out, then the URL is reported to the Story 7.1 surface with its class and retry outcome, and the failure is never silent.
- Given MZ's `Utils.canUseWebGL()` probe, when the capability check runs, then the probe context is released through `WEBGL_lose_context`.
- Given the plugin change, when the mock is regenerated, then `src/lib/engine-mock.generated.ts` stays byte-identical to its sources.

## Implementation Notes

- Retry is boot-window scoped, matching Story 7.1's reporting scope: `bootReady` disables both the retry budget and the reports, so a mid-game failure keeps the engine's own behaviour.
- The bitmap retry re-enters `Bitmap._startLoading()`, MZ's own loading entry point, instead of touching `_image.src`: it re-establishes the encrypted-image path as well as the plain one, and MZ's bound `onload` then completes the load.
- `assetFailureKind` reads Resource Timing `responseStatus` synchronously because a failed `<img>` element carries no status; an absent entry means the request never completed (network-level, retryable), which is the fallback in browsers without the property.
- The terminal bitmap path sets `_loadingState = "error"` and does not call the shipped image guard's `_onError`: its `alert()` blocks the very surface that reports the failure, and Story 7.1's contract makes the host panel the player-facing outcome.
- Retry-owned image elements are registered in a `WeakSet` so the capture-phase resource-error hook does not report the same URL before the retry budget has run.
- The XHR hook only wraps same-origin engine asset GETs whose caller uses `onload`/`onerror`; re-issuing re-opens the request and restores `responseType` so the engine sees the same response shape. A caller's `overrideMimeType` is not replayed: `DataManager.loadDataFile` sets `application/json` for its own parse, and `responseText` returns the body either way.

## Spec Change Log

- 2026-09-21 — MZ 1.8.0 sources pulled from the private bucket (`engine/js/rmmz_core.js`, `rmmz_managers.js`, `main.js`, `js/plugins/MIF_MZ_PreventPictureCrash.js`) fixed the two mechanisms: `Bitmap._startLoading` (`rmmz_core.js:1783`) is the loading entry point that a retry can re-enter, and `DataManager.loadDataFile` (`rmmz_managers.js:105`) is an `XMLHttpRequest` GET whose `onerror`/`onload` the plugin can re-dispatch faithfully.
- 2026-09-21 — `_bmad/custom/config.toml` pins `core.communication_language`; the central `_bmad/config.toml` does not carry the key the skill renderer requires, so skill rendering halted without it.

## Review Triage Log

## Design Notes

Retry shape: equal jitter over a doubling ceiling (300ms, 600ms) caps the two attempts at 2s; the budget is per URL per boot, so one slow asset cannot consume another's retries.

Player-facing copy is unchanged: a rejected session reloads `/play`, whose server validation already maps the session status to the paywall type, and the retry outcome appears only inside the mono diagnostics block ("Retry attempts", "Session").

## Verification

**Commands:**
- `node --experimental-strip-types --import ./tests/helpers/register-loader.mjs --test tests/engine-asset-retry.test.ts` — expected: 11/11 pass.
- `npm run test:unit` — expected: every suite passes, including `tests/suite-manifest.test.ts` for the new file and the engine-bridge byte-identity assertion.
- `npm run lint` — expected: no errors.
- `npm run build` — expected: OpenNext build succeeds (`prebuild` regenerates the engine mock).
- `npm run test:e2e` — expected: existing Chromium specs pass against the mock harness with no recovery surface.
