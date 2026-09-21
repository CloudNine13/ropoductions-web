# Epic 7 Brief: Cross-Browser Engine Delivery & Boot Reliability

- **Date:** 2026-09-21
- **Derives from:** owner defect reports of 2026-09-21 and the measurement session recorded in §Evidence (this brief is the record of that session)
- **Owner:** Igor

## Problem

Owner-reported, reproducible-in-Firefox defects on the deployed portal (Firefox 156, Linux, own GPU; same build plays fine on third-party portals such as Gamcore in the same Firefox):

- **D1 — Refresh breaks asset delivery.** After a reload, some engine asset requests fail. The shipped game build's own guard fires an alert — `Image: img/system/Load/Load1.png has failed to load.` (`js/plugins/MIF_MZ_PreventPictureCrash.js`) — and the owner sees the game boot with missing sprites on the title/loading screens and a missing custom cursor.
- **D2 — Refresh occasionally fails the boot with a browser-capability error.** RPG Maker MZ shows `Error: Your browser does not support WebGL.`, emitted by `SceneManager.checkBrowser` (`js/rmmz_managers.js:1893-1895`) when `Utils.canUseWebGL()` (`js/rmmz_core.js:294`, a plain `document.createElement("canvas").getContext("webgl")`) returns null. The first load after login works; the failure appears on reload, intermittently.
- **D3 — Refresh occasionally fails the boot with a file-access error.** MZ shows `Error: Your browser does not allow to read local files.`, emitted by `Main.onWindowLoad` (`js/main.js:114-117`) when the `testXhr()` probe's `GET` of `js/main.js` never fires a `load` event — i.e. a network-level failure or abort, not an HTTP status (`onload` fires for 4xx/5xx too).
- **D4 — No diagnosis path.** Every failure is opaque to the player: MZ's raw error screen or a game-owned alert, no classified cause, no remediation, no way for the owner to report what actually failed.

## Evidence (measured 2026-09-21, this workstation)

| Probe | Result |
| --- | --- |
| Real Firefox 156, our exact iframe (`sandbox="allow-scripts allow-same-origin …"`, `allow="fullscreen; autoplay; gamepad"`) plus our full production header set (CSP, `X-Frame-Options`, `nosniff`, CORP), 7 variants | `getContext('webgl')`, `webgl2`, and `failIfMajorPerformanceCaveat: true` all succeed in every variant, parent and child |
| Real shipped shell pulled from R2 (`engine/`, MZ 1.8.0 + Pixi 5.3.12, upstream `salamin888/Final_Orginity@3cfd91f`) booted inside that iframe with our header set | Boots past `checkBrowser` and `initGraphics`, loads plugins, reaches `Scene_Boot` data loading; no WebGL error |
| Firefox WebGL budget, one document, headed (real GPU stack) | 40 live 1280×720 WebGL contexts created, zero refusals |
| Eight consecutive top-level reloads of that embed, headed | WebGL available every iteration, zero refusals; **6 WebGL contexts created per boot** |
| One boot's request profile | 65+ gated requests (13 core scripts, ~45 plugin scripts, css, wasm, fonts, data JSONs), then media |
| R2 object metadata for the reported asset and shell | `img/system/Load/Load1.png` → `image/png`; `engine/js/*.js` → `text/javascript`; `data/*.json` → `application/json` — objects exist and are typed correctly |
| Serving path per request (`src/app/api/game/[[...asset]]/route.ts`, `src/app/engine/[...path]/route.ts`) | cookie parse → `getDatabase()` → `getAuthEnv()` → `validateSessionAccess()` (D1) → R2 `head`/`get`; no session caching, no burst amortisation |
| Browser test coverage (`playwright.config.ts`) | Chromium only; no Firefox project, no reload-storm or burst test |

Conclusions that bound the fix:

- **Our origin configuration is exonerated for D2.** The sandbox tokens, `allow` list, CSP, CORP and same-origin iframe do not block WebGL in real Firefox, and the shipped shell boots under them. D2 is a browser/GPU-state failure of a plain WebGL context request, not a policy block — and it is not reachable by configuration changes to the iframe.
- **D1 and D3 are ours.** Assets exist, are typed correctly, and are requested by the engine; the failures are request-level (auth/session validation cost, burst behaviour, aborts) and correlate with the reload revalidation burst.
- **Our own context churn is real and fixable.** One MZ boot allocates 6 WebGL contexts (MZ's unreleased probe context, Pixi's probe, the Pixi renderer, Effekseer and plugin contexts). Combined with the upstream-confirmed fullscreen remount (Epic 6 Story 6.2) and the `engineKey` retry remount, several boots can land in one document — which is how the same `does not support WebGL` screen becomes reachable on browsers with tighter per-page budgets (Chrome's is 16).

## Plan

Sequenced so that each step reduces the failing surface, with diagnostics first so the owner's remaining environment-specific trigger (D2) is captured rather than guessed:

1. **Diagnose and surface (Story 7.1)** — classify every boot failure inside the engine document (via the bridge plugin we already own and inject) and in the parent (`/play` preflight), report it to the player as a localized, actionable recovery surface with the raw Gecko/engine detail, and retry without remount storms.
2. **Make the reload cheap (Story 7.2)** — the shell is currently revalidated request-by-request on every reload (`private, max-age=86400`, no version addressing). Serve it release-addressed (`?v=<commitSha>`) and immutable, so a reload costs one document request instead of a 65-request revalidation burst.
3. **Take session validation off the asset hot path (Story 7.3)** — bounded-TTL validation amortisation over the burst, fail-closed, so a boot cannot be broken by D1/D1-contention or latency on unrelated asset requests.
4. **Survive a single failed request (Story 7.4)** — bounded, network-error-only retry for engine image/data loads in the bridge plugin, so one aborted request no longer costs a sprite or a cursor; never retry 401/403 (those must escalate to the paywall path).
5. **Guard it (Story 7.5)** — Firefox e2e project, engine-boot assertion, reload-storm and asset-burst specs, and the R2-backed local smoke harness that produced the evidence table above.

## Scope

**In:** engine boot failure classification and recovery UX; release-addressed immutable shell delivery; asset-path validation amortisation; engine asset-load retry in the injected bridge plugin; Firefox/burst/reload verification; the documentation amendments these force (SPEC companion, architecture spine, AGENTS.md context, epics, tracking).

**Out:** any change to the OAuth flow, session issuance, tier gating, admin model, or engine build content; canvas-renderer fallback for MZ (the shipped Pixi 5.3.12 bundle contains no `CanvasRenderer` — only JSDoc references — so no canvas path exists without an upstream engine change); moving the game off the same origin; third-party hosting or CDN; making the game playable on hardware/browsers where WebGL is genuinely unavailable at OS/driver level (the contract is honest failure, not silent degradation).

## Success criteria

- On the deployed portal in Firefox and Chrome: a cold load plus five consecutive reloads produce zero raw engine error screens, zero missing-sprite/cursor symptoms, and zero failed `/engine/*` or `/api/game/*` responses in server logs.
- A reload issues at most one shell document request and no revalidation storm for version-addressed shell files.
- With WebGL genuinely unavailable (Firefox profile with `webgl.disabled=true`), the player sees a localized, actionable panel naming the cause and carrying the browser's raw `webglcontextcreationerror` detail and renderer string, instead of MZ's `Your browser does not support WebGL.`
- One MZ boot allocates no more WebGL contexts than the renderer requires; probe contexts are released; toggling fullscreen and retrying never loads the engine twice.
- The evidence table above is reproducible from the repository's own harness, on demand, in both browsers.

## Constraints

Repository policy applies unchanged: branch from updated `develop` inside a worktree, PR to `develop` only, Conventional Commits, no emojis, all new UI strings across the six locales with `labels` interface parity and a screen-reader path, no story references in code comments, no silent cutover.

Two contract changes in this plan require explicit owner decisions before implementation (recorded here as open decisions, not amendments):

- **OD-1 — Asset-path session validation.** `AGENTS.md` and `save-and-runtime-contract.md` state that `ropoductions_session` is validated against D1 on `/play` and every `/api/game/*` request. Story 7.3 amortises that validation across a burst with a bounded TTL. Approving it means amending both documents to the amortised, fail-closed semantics.
- **OD-2 — Shell cache addressing.** Story 7.2 refuses to serve version-addressed shell files without `?v=` and caches them immutably. That is a delivery-contract change (engine shell cache semantics), not a gameplay change, but it must be recorded in the same documents.
