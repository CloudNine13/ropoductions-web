# RPG Maker MZ Web Runtime & Save Persistence Contract

## 1. Engine & Runtime Specification
* **Engine:** RPG Maker MZ (HTML5/WebGL runtime).
* **Initial Package Footprint:** 5–30MB total asset payload.
* **Canvas Presentation:**
  * Rendered within an aspect-ratio-locked container (default 16:9).
  * Responsive scaling to fill desktop viewports and mobile screens without letterboxing distortion.
  * Mobile support: touch input emulation mapped to MZ standard mouse/touch coordinates; full-screen toggle for distraction-free play.

* **Fullscreen Continuity Invariant:**
  * The full-screen toggle is a layout change only: windowed and fullscreen presentation render from a single stable DOM tree that differs only in class names, with the engine iframe at the same position in the tree in both modes.
  * The engine iframe MUST NOT be remounted or relocated in the DOM when entering or leaving fullscreen; the same iframe element persists across every toggle.
  * Live in-memory game state (current scene, unsaved progress) MUST survive both directions of the toggle; a fullscreen change MUST NEVER return the game to the title screen.
  * The invariant is pinned end-to-end by asserting the engine iframe fires exactly one `load` event across a fullscreen enter→exit round trip, measured against the mock canvas harness of Section 6.

## 2. In-Browser Storage & Patch Invariant
* **Storage Mechanism:** RPG Maker MZ stores save slots in client browser storage:
  * IndexedDB (`rmmz_save`) or LocalStorage (`rmmz_save_{index}`).
  * Browser storage is strictly partitioned by **Web Origin (`https://domain:port`)**.
* **Deployment & Patching Invariant:**
  * Game code updates, patches, and asset updates must be deployed under the **identical web origin** and directory namespace.
  * Ephemeral or version-suffixed subdomains (e.g., `v1.domain.com` -> `v2.domain.com`) are strictly prohibited, as they partition local storage and hide existing save files.
* **Backward Compatibility Guarantee:**
  * Studio game developers are responsible for ensuring in-game MZ plugins and event scripts do not break existing save schemas when deploying patches.
  * Incomplete saves or uninitialized new variables in older saves must be handled with fallback defaults by the MZ plugins.

## 3. Web Shell Save Management HUD
The web game wrapper must provide an accessible, responsive HUD outside or overlaid on the game canvas:
* **Export Save Action:**
  * Triggers postMessage `{ type: 'ROPODUCTIONS_GET_SAVES' }` to the game iframe.
  * Packages all populated save files (`file1.rpgsave` ... `file20.rpgsave`, `global.rpgsave`, `config.rpgsave`) client-side using `jszip`.
  * Triggers an immediate browser file download named `ropoductions_saves_{YYYY-MM-DD}.zip`.
* **Import Save Action:**
  * Provides a drag-and-drop modal accepting `.zip` archives or individual `.rpgsave` files.
  * Validates file format integrity and RPG Maker MZ header signatures client-side.
  * If valid, sends save payloads via postMessage `{ type: 'ROPODUCTIONS_SET_SAVES', payload }` to the game iframe.
  * Signals the MZ engine to write data to IndexedDB (`rmmz_save`) and invokes `DataManager.loadGlobalInfo()` to refresh in-game title and load screens instantly without an iframe reload.
  * If invalid or corrupt, displays an inline red error banner without mutating storage.
* **Storage Diagnostics:**
  * Clear/Reset storage option with a destructive confirmation modal (for troubleshooting or starting fresh).

* **Dock Visibility Contract (Fullscreen-Scoped):**
  * On entering fullscreen the dock defaults to collapsed behind its persistent 44px affordance; the expanded dock MUST NEVER appear automatically on fullscreen entry, and exiting fullscreen restores only the windowed dim-only presentation defined below.
  * Expansion occurs only by explicit user action on the affordance (pointer or keyboard); canvas activity, engine activity, and bridge messages MUST NEVER restore or expand dock chrome.
  * The collapsed state returns on idle: a dock expanded by user action re-collapses behind the affordance after the same idle period that dims windowed chrome.
  * While an export is in flight or a dock dialog (import or storage diagnostics) is open, the dock holds its expanded state until that operation completes or the dialog closes.
  * The windowed dock is unchanged by this contract: always rendered below the canvas and visible, dim-only chrome after the 4-second idle timeout, never auto-collapsed.
  * The collapse affordance remains keyboard-reachable and announced in both modes, so no save action becomes unreachable from the collapsed state.

## 4. In-Game Bridge Plugin (`Ropoductions_WebBridge.js`) Contract
* **Plugin Location:** Sourced from `src/engine-plugins/Ropoductions_WebBridge.js` (registered in `plugins.js`); the ingestion runner injects it into the shell before the shell is synced to R2.
* **Origin Verification:** Every incoming message MUST strictly verify `event.origin === window.location.origin` to block cross-origin script injection and save data theft.
* **Message Protocol:**
  * **Outbound Save Request:**
    - Inbound: `{ type: 'ROPODUCTIONS_GET_SAVES' }`
    - Outbound to Parent: `{ type: 'ROPODUCTIONS_SAVES_DATA', payload: { slots: Record<string, string>, global: string, config: string } }`
  * **Inbound Save Injection:**
    - Inbound: `{ type: 'ROPODUCTIONS_SET_SAVES', payload: Record<string, string> }`
    - Action: Iterates payload keys, executes `StorageManager.saveObject(key, data)`, then calls `DataManager.loadGlobalInfo()`.
    - Outbound to Parent: `{ type: 'ROPODUCTIONS_SET_SAVES_SUCCESS' }`
  * **Safe Storage Reset:**
    - Inbound: `{ type: 'ROPODUCTIONS_RESET_SAVES' }`
    - Action: Clears IndexedDB `rmmz_save` table via `StorageManager`, re-invokes `DataManager.loadGlobalInfo()`.
    - Outbound to Parent: `{ type: 'ROPODUCTIONS_RESET_SAVES_SUCCESS' }`

## 5. Game Release Ingestion & Pipeline Invariant
* **Pipeline Automation:** Game releases from upstream repository `salamin888/Final_Orginity` are ingested via `.github/workflows/sync-game-release.yml` in `CloudNine13/ropoductions-web`.
* **Dual Trigger Mechanism:**
  - **Manual Trigger:** Web portal maintainer triggers `workflow_dispatch` with input `branch` (default `auto`).
  - **Remote Upstream Trigger:** Upstream game maintainers trigger `repository_dispatch` (event type `game_release_published`) directly from `salamin888/Final_Orginity` via a fine-grained GitHub PAT scoped strictly to dispatching workflows on `CloudNine13/ropoductions-web`.
* **Credential Isolation:**
  - Cloudflare R2 credentials (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_ACCOUNT_ID`) and upstream clone credentials (`UPSTREAM_READ_TOKEN`) reside strictly within `ropoductions-web` GitHub Secrets.
  - The upstream repository is NEVER given Cloudflare tokens or write access to the web repository.
* **Validation & Shell Ingestion:**
  - Pipeline verifies file structure (`data/System.json`, `index.html`) and injects `Ropoductions_WebBridge.js` before copying assets.
  - Media assets (`audio/`, `img/`, `effects/`, `movies/`, `data/`) sync to private Cloudflare R2 (`GAME_ASSETS`) and are never release-addressed.
  - Lightweight engine shell (`index.html`, `js/`, `css/`, `fonts/`, `icon/`) syncs additively to private R2 (`GAME_ASSETS`) under the `engine/` prefix and streams same-origin at `/engine/*`; the ingestion runner never commits to Git.
  - **Release addressing is a pipeline concern.** Before publishing, the runner computes a content digest of the staged shell and bakes it into every shell subresource reference it can reach, so the browser cache key changes with the bytes; it fails the run rather than publish a shell whose URL builders it no longer recognises. The runner then publishes the shell in two phases — every shell object except `index.html` first, then `index.html` last — so a client can never read a new document while a subresource still holds the previous release's bytes. `build-metadata.json` records `releaseId` and `addressingRevision` for humans and is deliberately NOT uploaded: the runtime holds no release state and never reads release metadata (`engine-browser-compat.md` §2).

## 6. Decoupled Mock Harness Testing Invariant
* **Independent Container Verification:** The web game iframe container (`src/app/(game)/play/page.tsx`, Story 3.1) and Save HUD dock (`src/components/save-hud-dock.tsx`, Epic 4) are architecturally decoupled from upstream game download infrastructure.
* **Local Canvas Test Harness:**
  - The web client iframe targets same-origin `/engine/index.html`.
  - For local development, integration, and E2E verification prior to upstream asset availability, the `/engine/[...path]` route serves a lightweight HTML5 `<canvas>` mock harness (`src/engine-plugins/mock-shell.html`) at `/engine/index.html` while R2 holds no published shell — "no published shell" means the requested object does not exist, which is the only signal the runtime has. The runtime never asks whether a release exists and never reads release metadata.
  - The harness renders a 16:9 canvas (1280x720) with active input visualization and implements the `postMessage` protocol defined in Section 4 (`ROPODUCTIONS_GET_SAVES`, `ROPODUCTIONS_SET_SAVES`, `ROPODUCTIONS_RESET_SAVES`).
  - Replacing the mock canvas harness with the production engine shell requires zero modifications to the web wrapper container, layout, or postMessage handlers.

## 7. Asset-Path Authentication Invariant
* Session validation for `/api/game/*` and `/engine/*` MUST NOT scale with the number of requests in an engine boot burst: those two routes validate through a bounded-TTL memoisation of a successfully validated session, keyed by a full-length digest of the session cookie bound to the current signing secret (a rotated secret misses every entry), held per isolate, default window 60 seconds. The memo retains the verdict's bounds only — never the session record, its id, or the cookie. The authoritative wording, including its verification contract, is `engine-browser-compat.md` §4.
* D1 remains the authority and validation stays fail-closed. Only an `authorized` verdict is memoised. A validation error, a revoked, expired, unknown or unauthorized session, and any cache miss that cannot validate return `403`/`5xx` — never implicit authorisation — and no request that fails to validate may create or extend a window entry.
* Revocation and expiry take effect no later than the window after the next request. An entry also ends with the validated verdict's own `expires_at_sec`; for an override-elevated session that value is the elevated expiry `validateSessionAccess` writes, so the window is the effective bound on that path.
* Anonymous requests (no session cookie) cost zero D1 reads on both routes.
* The store is bounded by a settled-entry cap (256 authorized verdicts per isolate). In-flight validations are never counted or evicted and remove themselves when they settle, so retention is the cap plus in-flight concurrency, and an in-flight validation holds its cookie closure until it settles. Eviction is a retention bound, never an authorization decision: an evicted session revalidates against D1 on its next request.
* `/play` navigation entry and the admin surfaces keep strict per-request D1 validation, so a revoked patron is stopped at the door rather than up to a window later.
* The revocation window bounds *requests*, not cached bytes: an addressed shell response is cached by the browser for a year (`engine-browser-compat.md` §2), so a revoked patron whose session cookie is unchanged keeps that shell locally. What stops the game is everything that is not the shell — `/play` itself, and the media/`data` burst (`private, max-age=86400`) it needs to boot — and the shell alone cannot boot.
