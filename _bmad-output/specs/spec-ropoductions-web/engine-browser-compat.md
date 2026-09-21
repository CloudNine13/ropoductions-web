# Engine Browser Compatibility Contract

Companion to `SPEC.md`. Defines how the RPG Maker MZ engine is delivered, how its boot failures are classified and surfaced, and how the contract is verified. Applies to `/play`, `/engine/*` and `/api/game/*`.

## 1. Engine boot failure taxonomy

Every player-visible engine boot failure maps to exactly one class. The engine's raw error string is diagnostic input, never the player-facing outcome.

| Engine string (MZ 1.8.0) | Source | Class | Required behaviour |
| --- | --- | --- | --- |
| `Your browser does not support WebGL.` (`rmmz_managers.js:1894`) | `SceneManager.checkBrowser` → `Utils.canUseWebGL()` = `!!document.createElement("canvas").getContext("webgl")` returned null | `webgl_unavailable` | Localized panel: WebGL is unavailable for this browser session. Actionable remediation (enable hardware acceleration, restart the browser, retry), raw `webglcontextcreationerror.statusMessage` and renderer/vendor strings attached, retry affordance, diagnostics copyable. Never MZ's raw screen. |
| `Your browser does not support Web Audio API.` / `... CSS Font Loading.` / `... IndexedDB.` (`rmmz_managers.js:1897-1903`) | `SceneManager.checkBrowser` | `browser_capability` | Same panel shape, class-specific copy. |
| `Your browser does not allow to read local files.` (`main.js:116`) | `Main.onWindowLoad` with `xhrSucceeded === false` — the `testXhr()` GET of `js/main.js` never fired `load` (network-level failure, not an HTTP status) | `boot_request_failed` | Same panel shape, plus the failing URL and the retry outcome; the request is retried once by the host before the panel appears. |
| `Failed to load` + URL (`main.js:91,155`, `rmmz_managers.js:2042`) | script/asset/js load error | `asset_load_failed` | Same panel shape with the URL; a single transient failure must have been retried first (Section 3). |
| Game-owned alert `Image: <url> has failed to load.` (`js/plugins/MIF_MZ_PreventPictureCrash.js`) | shipped upstream plugin on an image load error | `asset_load_failed` | If the asset is still missing after retries, the host surfaces its own localized report; the upstream alert must not be the only signal the player gets. |
| `Failed to initialize graphics.` (`rmmz_managers.js`) | `Graphics.initialize()` returned false | `renderer_init_failed` | Treated as `webgl_unavailable` for player copy, with the renderer detail attached. |

The taxonomy is the classification contract: adding a class means adding its copy to all six locales and its branch to the host recovery surface.

## 2. Delivery and caching

- The engine shell (HTML, `js/`, `css/`, `fonts/`, `icon/`) is **release-addressed**: the shell document is requested with the release identifier (`/engine/index.html?v=<commitSha>` from `build-metadata.json`), and every shell subresource URL carries the same identifier.
- Shell responses are cached `private, immutable, max-age=31536000` keyed by that identifier. A reload MUST NOT revalidate the shell. A new release changes every shell URL; nothing else invalidates it.
- Shell subresources MUST be served with the correct content type (`text/javascript`, `text/css`, `font/woff2`, `image/png`) and MUST NOT be served without their `?v=` identifier — an unaddressed shell request is refused rather than cached.
- Media (`img/`, `audio/`, `effects/`, `movies/`, `data/`) keeps a moderate private cache (currently `private, max-age=86400`) because the upstream sync is additive and may reuse file names across releases. Media revalidation MUST NOT cost more than one D1 read per boot (Section 4).
- Engine boot must remain exactly one document per `/play` mount: fullscreen toggles, retry and HUD interactions never remount the iframe (see `save-and-runtime-contract.md` §1 and CAP-12).

## 3. Boot-path resilience

- A single failed or aborted request MUST NOT cost a sprite, a cursor or a boot. Engine-side image and data loads are retried by the injected bridge plugin: at most 2 retries, exponential backoff with jitter, same URL, and only for network-level failures (abort, connection reset, `5xx`).
- `401`/`403` responses are NEVER retried at the asset layer. They escalate to the session/paywall path: the host re-validates the session and routes the player to renewal or re-authentication.
- Retries MUST NOT create new engine documents, new WebGL contexts for probing, or additional iframe loads.
- Probe contexts are released: MZ's `Utils.canUseWebGL()` probe context is disposable and MUST be released with `WEBGL_lose_context` after the check; the host asserts one renderer context per boot.

## 4. Asset-path authentication cost

- Session validation for `/api/game/*` and `/engine/*` MUST NOT scale with the number of requests in a boot burst. Burst-amortised validation (a bounded-TTL memoisation of a successfully validated session, keyed by a digest of the session cookie bound to the current signing secret, so a rotated secret misses every entry, default TTL 60s) is the contract; D1 remains the authority and validation stays fail-closed (validation error ⇒ 5xx or 403, never implicit authorisation).
- Revocation and expiry MUST take effect within the amortisation window (worst case: TTL after the next request), and the window MUST NOT be extended by unauthenticated or failing requests.
- Anonymous or unauthenticated requests MUST cost zero D1 reads.

## 5. Browser support matrix

| Browser | Status |
| --- | --- |
| Chrome / Edge (latest, desktop + Android) | Supported; WebGL required, typed recovery surface when unavailable |
| Firefox (latest + ESR, desktop + Android) | Supported; treated as a first-class target — verification runs in real Firefox, not only Chromium |
| Safari (latest, macOS + iOS) | Supported for the portal; engine requires WebGL2-capable Safari 15+ |
| Browsers without WebGL | Honest failure: classified, localized recovery surface with remediation and diagnostics. No canvas fallback exists (the shipped Pixi 5.3.12 bundle contains no `CanvasRenderer`). |

## 6. Verification contract

- **Firefox boot e2e:** `/play` boots the engine harness in a real Firefox project and asserts no recovery surface appears and boot reaches the engine's ready state.
- **Reload storm:** five consecutive reloads of `/play` in Firefox and Chromium produce zero boot failures, zero missing-asset reports, and no shell revalidation burst.
- **Asset burst:** the boot's request profile (65+ requests) is replayed against the routes; every response is `200`/`304` and the burst costs at most one D1 validation read.
- **Honest-failure check:** with WebGL disabled in the browser profile, the classified recovery surface appears with the raw status message, in the active locale.
- **R2-backed smoke harness:** a repository script boots the real shell from the private bucket with the production header set in Firefox and Chromium, and prints the per-boot WebGL context and request profile. This is the harness that produced the Epic 7 brief's evidence table.
