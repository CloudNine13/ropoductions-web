---
title: 'Story 4.1: In-Game PostMessage Web Bridge (Ropoductions_WebBridge.js) with Origin Locking'
type: 'feature'
created: '2026-09-18'
status: 'done'
baseline_commit: '63ae479...'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/planning-artifacts/architecture/architecture-ropoductions-web-2026-09-15/ARCHITECTURE-SPINE.md'
  - '_bmad-output/specs/spec-ropoductions-web/save-and-runtime-contract.md'
  - '_bmad-output/planning-artifacts/ux-designs/ux-ropoductions-web-2026-09-15/DESIGN.md'
  - '_bmad-output/planning-artifacts/ux-designs/ux-ropoductions-web-2026-09-15/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** RPG Maker MZ saves game state directly into origin-partitioned browser storage (IndexedDB `rmmz_save`). Without a secure, origin-locked bidirectional communication bridge between the host Web Shell (React 19 / Next.js 16) and the embedded MZ engine runtime inside the same-origin iframe, the host cannot query available saves for backup export, restore imported save packages, or trigger storage resets. Furthermore, arbitrary cross-window messaging without strict origin validation (`event.origin === window.location.origin`) and prototype pollution guards risks exposing save files to cross-origin extraction or corrupting client storage.

**Approach:** 
1. Maintain and harden the in-game plugin `src/engine-plugins/Ropoductions_WebBridge.js` with strict origin equality checking (`event.origin === window.location.origin`), source verification (`event.source === window.parent` when nested in an iframe), slot key validation (`ALLOWED_SLOT_REGEX`), prototype pollution prevention (`__proto__`, `constructor`, `prototype`), payload size limits (10MB per slot), and clean calls to `StorageManager` and `DataManager.loadGlobalInfo()`.
2. Define canonical TypeScript interfaces for save messages and payloads in `src/types/save.ts`.
3. Provide robust client-side communication utilities in `src/lib/save-bridge.ts` (`requestSaves`, `restoreSaves`, `resetSaves`) featuring origin matching, request-response correlation, timeout boundaries, and input validation.
4. Implement Section 6 of the Save and Runtime Contract in `public/engine/index.html` by equipping the local canvas mock harness with mock `StorageManager` and `DataManager` runtimes and loading `Ropoductions_WebBridge.js` so decoupled local development and E2E verification function identically to the upstream production engine.

## Boundaries & Constraints

**Always:**
- Strictly enforce `event.origin === window.location.origin` for all postMessage exchanges in both the engine plugin and host web shell.
- When nested in an iframe (`window.parent !== window`), strictly ensure `event.source === window.parent` in the engine plugin to block messages from siblings or nested frames.
- Sanitize all slot keys against prototype pollution (`__proto__`, `constructor`, `prototype`) and enforce valid save slot naming (`file1`..`file20`, `global`, `config`, with optional `.rpgsave` suffix).
- Trigger `DataManager.loadGlobalInfo()` upon successful save restore (`ROPODUCTIONS_SET_SAVES`) or reset (`ROPODUCTIONS_RESET_SAVES`) to refresh in-game load screens without requiring an iframe reload.
- Limit maximum single slot payload size to 10MB to prevent memory exhaustion and DoS.
- Provide a clean async Promise interface with configurable timeout rejection (default 5000ms) on the host Web Shell side.
- Register all new test files in `package.json` under `test:unit` to satisfy `tests/suite-manifest.test.ts`.

**Never:**
- Never accept wildcard `*` targetOrigin in `postMessage` calls.
- Never write unsanitized keys or objects directly into `StorageManager`.
- Never execute DOM mutations or page reloads from inside the engine bridge.
- Never use emojis in console logs or UI output.

## I/O & Edge-Case Matrix

| Scenario | Inbound Message | Handler / Action | Response to Host | Error / Edge Case Handling |
|----------|-----------------|------------------|------------------|----------------------------|
| Query Saves | `{ type: 'ROPODUCTIONS_GET_SAVES' }` | Iterates `file1`..`file20`, `global`, `config` in `StorageManager` | `{ type: 'ROPODUCTIONS_SAVES_DATA', payload: { slots, global, config } }` | Non-existent slots skipped; read errors caught silently |
| Restore Saves | `{ type: 'ROPODUCTIONS_SET_SAVES', payload }` | Validates keys/sizes, calls `StorageManager.saveObject()`, reloads `DataManager.loadGlobalInfo()` | `{ type: 'ROPODUCTIONS_SET_SAVES_SUCCESS' }` | Invalid keys skipped; non-object payload dropped |
| Reset Saves | `{ type: 'ROPODUCTIONS_RESET_SAVES' }` | Calls `StorageManager.remove()` across all 22 slots, reloads `DataManager.loadGlobalInfo()` | `{ type: 'ROPODUCTIONS_RESET_SAVES_SUCCESS' }` | StorageManager removal errors caught gracefully |
| Untrusted Origin | Message from `https://attacker.com` | Ignored | None | Dropped immediately before parsing |
| Wrong Source | Message from sibling frame | Ignored | None | Dropped immediately (`event.source !== window.parent`) |
| Host Timeout | Host sends request, engine crashed or unresponsive | Timeout timer fires in `save-bridge.ts` | Promise rejected | Timeout error thrown after deadline |

</frozen-after-approval>
