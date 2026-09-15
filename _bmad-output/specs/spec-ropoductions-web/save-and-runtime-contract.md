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
  * Extracts the active save slot (or bundle of all slots) from browser storage.
  * Triggers an immediate browser file download of the raw `.rpgsave` binary file.
* **Import Save Action:**
  * Provides a file picker accepting `.rpgsave` files.
  * Validates file format integrity.
  * Writes the imported save data into the target browser storage slot (`rmmz_save`).
  * Signals the MZ engine or reloads the iframe/canvas to refresh the in-game save/load index.
* **Storage Diagnostics:**
  * Clear/Reset storage option with a confirmation modal (for troubleshooting or starting fresh).
