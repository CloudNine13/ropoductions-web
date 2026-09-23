# Handoff — Story 7.7: WebGL context-loss recovery (medium, deferred)

## Context
Firefox `/play`: first load perfect, after 2–3 refreshes menu image, cursor, save/load faces missing. HTTP 200s, console shows `WebGL context was lost` in `pixi.js`. Root cause: per-boot probe contexts (host + bridge) plus retained Pixi canvases exhaust Firefox's context budget across fast reloads; textures uploaded after the loss stay black with no `Failed to load` signal.

## Done in 7-6 (this branch)
- Host probe memoised after first success (`src/lib/engine-boot-failure.ts`).
- Bridge `Utils.canUseWebGL` returns cached `true` (`src/engine-plugins/Ropoductions_WebBridge.js`).
- `pagehide` context sweep on both sides (host `game-viewport.tsx`, engine bridge).
- `/engine/cordova.js` compat shim (`text/javascript`, 200) silencing the MIME-block noise.

## Remaining (7-7)
Listen for `webglcontextlost` on the engine canvas in the bridge; `preventDefault()` where recoverable, classify as `renderer_init_failed`, post `ROPODUCTIONS_ENGINE_BOOT_FAILURE` to the host only inside the boot window; host surfaces the existing `webgl_unavailable` recovery panel with retry that does a full-document reload (never an iframe-only reload). Mid-game loss must never replace a live session — report only, no panel.

## Acceptance
- Force `loseContext()` mid-boot in Firefox: classified panel appears, retry reboots clean.
- Force loss mid-game: no panel swap, game continues or degrades per engine.
- 5x Firefox reload storm stays green; `profile:boot --reloads 4` shows no growth in live contexts.
- No new probe contexts on retry paths (`engine-browser-compat.md` §3).
