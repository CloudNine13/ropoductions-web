---
title: 'Story 3.1: Sandboxed Same-Origin Game Iframe & Responsive 16:9 Viewport Container'
type: 'feature'
created: '2026-09-17'
status: 'done'
baseline_commit: '941fdc168c4fe397b04f1f3dca49aabd176e9859'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/planning-artifacts/architecture/architecture-ropoductions-web-2026-09-15/ARCHITECTURE-SPINE.md'
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
  - '_bmad-output/planning-artifacts/ux-designs/ux-ropoductions-web-2026-09-15/DESIGN.md'
  - '_bmad-output/planning-artifacts/ux-designs/ux-ropoductions-web-2026-09-15/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Authorized patrons arriving at `/play` currently see a static placeholder card instead of the playable RPG Maker MZ game. Without an aspect-ratio-locked viewport container, mobile and desktop viewports suffer address bar shifts, vertical overflow scrollbars, touch input latency from double-tap delays, and letterbox distortion. Furthermore, native fullscreen toggles that fail to account for WebKit vendor prefixes or iOS Safari limitations risk silent failures.

**Approach:** Implement a responsive game viewport container locked to a 16:9 aspect ratio (`aspect-[16/9]`) constrained within `100dvh` and `100dvw` (`src/components/game-viewport.tsx`). Embed the engine in a same-origin `<iframe>` pointing to `/engine/index.html` with permissions `allow="fullscreen; autoplay; gamepad"` and sandbox tokens (`allow-scripts allow-same-origin allow-forms allow-downloads allow-modals allow-pointer-lock allow-orientation-lock`). Mount an accessible 44x44px Fullscreen toggle button directly inside the container overlay with cross-browser WebKit prefix fallbacks (`webkitRequestFullscreen`, `webkitExitFullscreen`) and CSS pseudo-fullscreen fallback for iOS Safari. Set `touch-action: manipulation` and `overscroll-behavior: none` both on the outer wrapper and inside `public/engine/index.html`. Provide a lightweight HTML5 engine placeholder shell in `public/engine/index.html` with a 16:9 canvas and touch coordinate mapper prior to upstream release ingestion in Story 3.3. Register the new test file in `package.json` under `test:unit` to preserve `suite-manifest` compliance.

## Boundaries & Constraints

**Always:**
- Host the MZ engine strictly within a same-origin `<iframe>` at `/engine/index.html` on the identical web origin (`protocol://domain:port`); subdomains or external hosts are prohibited to preserve IndexedDB (`rmmz_save`).
- Lock the game viewport container to a strict 16:9 aspect ratio (`aspect-[16/9]`) constrained by available flex container space without creating vertical scrollbars (`h-[100dvh] overflow-hidden`).
- Support WebKit vendor prefixes (`webkitFullscreenElement`, `webkitRequestFullscreen`, `webkitExitFullscreen`) with try/catch rejection handling and graceful fallback for browsers lacking native `requestFullscreen` (e.g. iOS Safari iPhone).
- Mount the Fullscreen toggle overlay inside the fullscreen target container (`containerRef.current`) so the exit control remains accessible when browser native fullscreen is active.
- Strip container rounded corners, borders, and margins when active in fullscreen mode (`w-screen h-screen max-w-none max-h-none rounded-none border-0`).
- Declare `touch-action: manipulation` and `overscroll-behavior: none` both on the container and within `public/engine/index.html` (`html`, `body`, `#gameCanvas`) so mobile gesture zooming and pull-to-refresh are suppressed inside the child document.
- Delegate `gamepad` in iframe `allow` attribute (`allow="fullscreen; autoplay; gamepad"`) so RPG Maker MZ's `Input._updateGamepadState()` controller polling operates unblocked.
- Maintain minimum 44x44px touch targets on interactive controls (Fullscreen toggle, Return to Studio Portal).
- Synchronize fullscreen UI state across native browser fullscreen events (`fullscreenchange`, `webkitfullscreenchange`).
- Zero emojis as icons; use Lucide React SVGs only (`Maximize2`, `Minimize2`, `Gamepad2`).
- Adhere to design tokens: `#090A0F` background, `#121522` card/panel, `#22C55E` studio emerald, `#23283E` border.
- Register all new test files in `package.json` under `test:unit` to satisfy `tests/suite-manifest.test.ts`.
- Use camelCase keys in `game` namespace across all 6 locale files (`src/locales/*.json`) to satisfy `tests/i18n-locales.test.ts`.

**Never:**
- Never host the engine on a separate subdomain or external origin, which would partition IndexedDB storage across deployments.
- Never allow top-level window navigation from inside the sandboxed iframe (`allow-top-navigation` is strictly omitted).
- Never allow double-tap gesture zooming, pull-to-refresh, or page scrollbars to distort the 16:9 canvas.
- Never leave the user trapped in fullscreen mode without an in-container toggle button.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Authorized Patron Visit | Valid session and age cookie at `/play` | Renders 16:9 `GameViewport` containing `/engine/index.html` iframe | Graceful error boundary if iframe fails |
| Viewport Resizing (Desktop/Mobile) | Screen resized or rotated (landscape/portrait) | Container maintains strict 16:9 ratio without overflow past `100dvw` / `100dvh` | CSS aspect-ratio containment (`h-full w-auto aspect-[16/9] max-w-full`) |
| Mobile Touch Interaction | Tap or drag on game canvas | Direct coordinate registration without 300ms double-tap delay | `touch-action: manipulation` on canvas and wrapper |
| Fullscreen Click (Standard WebKit/Blink/Gecko) | User clicks "Fullscreen" button | Invokes `requestFullscreen()` or `webkitRequestFullscreen()`, icon toggles to `Minimize2` | Wrapped in try/catch to absorb promise rejection |
| Fullscreen Click (Active) | User clicks "Exit Fullscreen" or presses Escape | Invokes `exitFullscreen()` or `webkitExitFullscreen()`, icon toggles back to `Minimize2` | Handled via `fullscreenchange` / `webkitfullscreenchange` |
| Fullscreen on iOS Safari (iPhone) | `requestFullscreen` unsupported on Element | Activates CSS pseudo-fullscreen overlay (`fixed inset-0 z-50`) and toggles state | Feature detection guard avoids unhandled TypeError |
| Keyboard Escape in Fullscreen | User hits Escape key | Browser exits fullscreen, event updates React state cleanly | Native event listener synchronization |
| Gamepad Connected | USB/Bluetooth controller connected | Controller input accessible via `navigator.getGamepads()` | `allow="gamepad"` delegated to iframe |

</frozen-after-approval>

## Code Map

- `src/components/game-viewport.tsx` -- Client component encapsulating the responsive 16:9 container, in-container fullscreen toggle overlay, WebKit/iOS fallback logic, iframe sandbox/allow policies, and touch-action constraints.
- `src/app/(game)/play/page.tsx` -- Server Component route handler verifying age gate and D1 session, with flex layout (`h-[100dvh] overflow-hidden`) rendering `GameViewport` without page scrollbars.
- `public/engine/index.html` -- Lightweight HTML5 engine shell bootstrap with canvas element (`#gameCanvas`), 16:9 aspect ratio, internal `touch-action: none` / `overscroll-behavior: none`, and touch/mouse coordinate listeners.
- `package.json` -- Update `test:unit` script to register `tests/game-viewport.test.ts`.
- `tests/game-viewport.test.ts` -- Unit tests validating 16:9 aspect ratio classes, iframe sandbox/allow attributes (`allow="fullscreen; autoplay; gamepad"`), touch-action styles, and fullscreen event synchronization.
- `src/locales/*.json` -- Multilanguage strings for game viewport controls (`game.fullscreenEnter`, `game.fullscreenExit`) across all 6 locales (`en.json`, `ja.json`, `es.json`, `ru.json`, `zh.json`, `pl.json`).

## Tasks & Acceptance

**Execution:**
- [x] `public/engine/index.html` -- Create lightweight HTML5 engine shell with 16:9 canvas, touch-action/overscroll suppression, and touch/mouse coordinate listeners -- Provides same-origin engine entrypoint for iframe.
- [x] `src/components/game-viewport.tsx` -- Create client component with 16:9 aspect ratio lock, in-container overlay fullscreen toggle, WebKit prefix support, iOS pseudo-fullscreen fallback, and iframe sandbox with gamepad delegation -- Implements FR-10, FR-11, FR-12, and UX-DR6.
- [x] `src/app/(game)/play/page.tsx` -- Update `/play` layout to `h-[100dvh] overflow-hidden flex flex-col` and replace placeholder card with `GameViewport` while preserving session verification and header -- Connects `/play` to the game client without vertical scrollbars.
- [x] `src/locales/*.json` -- Add `game.fullscreenEnter` and `game.fullscreenExit` across all 6 locales (en, ja, es, ru, zh, pl) -- Fulfills i18n parity and satisfies `tests/i18n-locales.test.ts`.
- [x] `package.json` -- Add `tests/game-viewport.test.ts` to `test:unit` script -- Satisfies `tests/suite-manifest.test.ts`.
- [x] `tests/game-viewport.test.ts` -- Add unit tests verifying iframe properties, sandbox tokens, gamepad delegation, aspect-ratio constraints, and fullscreen toggle logic -- Automated test verification.

**Acceptance Criteria:**
- Given an authorized patron arriving at `/play`, when the game page mounts, then it renders a same-origin `<iframe>` pointing to `/engine/index.html`.
- Given the game viewport, the container locks to a 16:9 aspect ratio constrained by `100dvh` and `100dvw` without vertical or horizontal scrollbars.
- Given a touch screen device, touch inputs on the canvas map directly to coordinates without double-tap zoom delay (`touch-action: manipulation` on container and canvas).
- Given the windowed game viewport, clicking the "Fullscreen" button triggers native Fullscreen or iOS pseudo-fullscreen, expands the container, and updates the in-container toggle button to "Exit Fullscreen".

## Implementation Notes

- Scaffolded `public/engine/index.html` as a lightweight HTML5 engine shell containing a 1280x720 canvas element with `touch-action: none`, `touch-action: manipulation` on body, `overscroll-behavior: none`, and interactive coordinate listeners for touch and pointer events with letterbox/pillarbox offset math.
- Created `src/components/game-viewport.tsx` ("use client") supporting 16:9 aspect ratio constraint bounded by `max-w-[calc((100dvh-4.5rem)*(16/9))]` with `w-auto` to prevent aspect ratio collapse in flex parents. Configured iframe with `allow="fullscreen; autoplay; gamepad"` and secure sandbox tokens omitting `allow-top-navigation`.
- Mounted an accessible 44x44px Fullscreen toggle button directly inside the container overlay with Lucide `Maximize2`/`Minimize2` icons and safe-area insets (`env(safe-area-inset-top)` / `env(safe-area-inset-right)`). Handled WebKit vendor prefixes (`webkitFullscreenElement`, `webkitRequestFullscreen`, `webkitExitFullscreen`), verified `currentFsElem === containerRef.current`, attached error listeners (`fullscreenerror`, `webkitfullscreenerror`), and supported iOS Safari pseudo-fullscreen fallback (`fixed inset-0 z-50`).
- Updated `src/app/(game)/play/page.tsx` root layout to `h-[100dvh] overflow-hidden` with a fixed-height header (`h-14 flex-none`) and flex containment (`min-h-0`) mounting `<GameViewport engineSrc="/engine/index.html" title={t("iframeTitle")} />` using localized strings via `getTranslations("game")`.
- Added localized strings under the `game` namespace (`fullscreenEnter`, `fullscreenExit`, `returnToPortal`, `title`, `iframeTitle`) across all 6 supported locales (`en.json`, `es.json`, `ja.json`, `pl.json`, `ru.json`, `zh.json`), passing `tests/i18n-locales.test.ts`.
- Registered `tests/game-viewport.test.ts` in `package.json` `test:unit` script, maintaining `tests/suite-manifest.test.ts` compliance.
- All 106 unit tests, D1 schema checks, Patreon OAuth verification, and the OpenNext Cloudflare production build pass cleanly.

## Spec Change Log

## Review Triage Log

- `high` -- `src/components/game-viewport.tsx` declaring both w-full and h-full collapses 16:9 aspect ratio in flex container. Evidence: Replaced with `w-auto h-full max-w-full aspect-[16/9]`. (route: patch)
- `high` -- `src/components/game-viewport.tsx` fullscreen mode lacked 16:9 frame on non-16:9 displays. Evidence: Added internal 16:9 aspect ratio wrapper preserving pillarbox/letterbox. (route: patch)
- `high` -- `src/components/game-viewport.tsx` useTranslations inside try-catch violated React Rules of Hooks. Evidence: Removed try-catch and called hook unconditionally at top level. (route: patch)
- `medium` -- `src/components/game-viewport.tsx` handleFullscreenChange false-positive on external fullscreen elements. Evidence: Added `currentFsElem === containerRef.current` guard. (route: patch)
- `medium` -- `src/components/game-viewport.tsx` WebKit fullscreen rejection lacked error listener. Evidence: Added `fullscreenerror` and `webkitfullscreenerror` event listeners triggering pseudo-fullscreen fallback. (route: patch)
- `medium` -- `src/components/game-viewport.tsx` static toggle button clipped by mobile device notches. Evidence: Added `env(safe-area-inset-top)` and `env(safe-area-inset-right)` styles. (route: patch)
- `medium` -- `src/app/(game)/play/page.tsx` hardcoded English strings. Evidence: Switched to server-side `getTranslations("game")`. (route: patch)
- `medium` -- `public/engine/index.html` touch listener lacked empty touches guard. Evidence: Added `e.touches && e.touches.length > 0` checks and letterbox coordinate scaling math. (route: patch)
- `low` -- `public/engine/index.html` redundant listener execution. Evidence: Added PointerEvent deduplication. (route: patch)
- `medium` -- `tests/game-viewport.test.ts` verification gaps. Evidence: Added letterbox/pillarbox math verification and hook/attribute tests. (route: patch)

## Design Notes

- **Viewport Layout & Scrollbar Elimination:**
  To guarantee no scrollbars on mobile or desktop viewports, `src/app/(game)/play/page.tsx` uses `h-[100dvh] w-full flex flex-col bg-[#090A0F] overflow-hidden`. The header has a fixed height (`h-14 flex-none`), and the main container has `flex-1 w-full min-h-0 overflow-hidden flex items-center justify-center p-2 sm:p-4`.
  The `GameViewport` component sizes itself using:
  ```tsx
  <div
    ref={containerRef}
    className={cn(
      "relative flex items-center justify-center bg-black overflow-hidden select-none touch-manipulation",
      isFullscreen
        ? "fixed inset-0 z-50 w-screen h-screen rounded-none border-0"
        : "w-auto h-full max-h-full aspect-[16/9] max-w-full rounded-xl border border-border/80 shadow-2xl"
    )}
  >
    <div className="relative w-full h-full aspect-[16/9] max-w-full max-h-full flex items-center justify-center overflow-hidden bg-black">
      <iframe
        src={engineSrc}
        title={title}
        className="w-full h-full border-0 touch-manipulation"
        allow="fullscreen; autoplay; gamepad"
        sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-modals allow-pointer-lock allow-orientation-lock"
      />
    </div>
    <button
      type="button"
      onClick={toggleFullscreen}
      className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-[max(0.75rem,env(safe-area-inset-right))] z-10 flex items-center justify-center h-11 w-11 rounded-lg bg-black/60 backdrop-blur-md border border-white/20 text-white hover:bg-black/80 transition-colors focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px] min-w-[44px]"
      aria-label={isFullscreen ? t('fullscreenExit') : t('fullscreenEnter')}
    >
      {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
    </button>
  </div>
  ```

## Verification

**Commands:**
- `npm run test:unit` -- expected: All unit tests pass including new `tests/game-viewport.test.ts` and `tests/suite-manifest.test.ts`.
- `npm test` -- expected: D1 schema and Patreon OAuth verification suites pass.
- `npm run build` -- expected: Clean OpenNext Cloudflare production build without type errors or lint warnings.
