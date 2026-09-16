# RPG Maker MZ Web Runtime & Save Persistence Contract

## 1. Engine & Runtime Specification
* **Engine:** RPG Maker MZ (HTML5/WebGL runtime).
* **Initial Package Footprint:** 5–30MB total asset payload.
* **Canvas Presentation:**
  * Rendered within an aspect-ratio-locked container (default 16:9).
  * Responsive scaling to fill desktop viewports and mobile screens without letterboxing distortion.
  * Mobile support: touch input emulation mapped to MZ standard mouse/touch coordinates; full-screen toggle for distraction-free play.

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

## 4. In-Game Bridge Plugin (`Ropoductions_WebBridge.js`) Contract
* **Plugin Location:** `public/engine/js/plugins/Ropoductions_WebBridge.js` (registered in `plugins.js`).
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
