# Epic 3 Context: Web Game Client & Protected Asset Streaming

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Authorized patrons can launch and play the embedded RPG Maker MZ game in an aspect-ratio-locked, responsive canvas with mobile touch and desktop parity, fed by session-authenticated streaming from the existing private Cloudflare R2 bucket. This epic eliminates letterbox distortion across viewports, protects studio game assets from scraping and hotlinking via edge verification, and establishes the release ingestion pipeline that separates the lightweight HTML5 engine shell from large encrypted media assets.

## Stories

- Story 3.1: Sandboxed Same-Origin Game Iframe & Responsive 16:9 Viewport Container
- Story 3.2: Authenticated R2 Asset Streaming Route & Edge Middleware Protection
- Story 3.3: Upstream Game Release Ingestion & R2 Sync Workflow

## Requirements & Constraints

- **Same-Origin Game Iframe (AD-2, FR-10, FR-13):** The RPG Maker MZ game must be hosted within a same-origin `<iframe>` at `/engine/index.html` on the identical web origin (`protocol://domain:port`). Subdomains or external hostnames are strictly prohibited to ensure the shared `IndexedDB` (`rmmz_save`) namespace is preserved across deployments and browser storage partitioning is prevented.
- **Responsive 16:9 Viewport Container (FR-10, UX-DR6):** The game container must lock to a strict 16:9 aspect ratio (`aspect-ratio: 16 / 9`) and scale dynamically to the available screen size, bounded by `max-height: 100dvh` and `max-width: 100dvw` to eliminate mobile address bar shifting and letterbox distortion.
- **Mobile Touch & Input Parity (FR-11):** Touch inputs on mobile screens must map directly to canvas mouse/touch coordinates without double-tap zoom delays, using CSS `touch-action: manipulation` on the viewport container and interactive canvas surface. Full keyboard navigation (WASD, Arrow keys, Escape, Enter) and mouse clicks must remain functional.
- **Fullscreen Mode Toggle (FR-12):** Provide an accessible Fullscreen toggle button that invokes the HTML5 Fullscreen API (`requestFullscreen()` / `exitFullscreen()`) on the outer viewport container, expanding the game to the physical display boundary and toggling icons between expand and compress states.
- **Authenticated R2 Asset Streaming (AD-5, FR-17, FR-18):** Static media assets (`audio/`, `img/`, `effects/`, `movies/`, `data/`) are stored in the pre-created private Cloudflare R2 bucket (`GAME_ASSETS`) with zero public URLs. `/api/game/[...asset]` verifies the `ropoductions_session` cookie against D1 and streams bytes with `Cache-Control: private, max-age=86400`. Requests without a valid session return HTTP 403 Forbidden with zero asset payload.
- **Encrypted Asset Runtime Support (FR-17):** RPG Maker MZ native asset encryption / obfuscation decrypts static assets in-memory during execution; edge routes stream encrypted files directly.
- **Upstream Release Ingestion Workflow (AD-9, Story 3.3):** Manual `workflow_dispatch` GitHub Action pulls release snapshots from `salamin888/Final_Orginity`, validates JSON integrity, injects `Ropoductions_WebBridge.js` into `public/engine/js/plugins/`, syncs media to R2 via AWS CLI/S3 API, and commits the lightweight HTML5 shell (`index.html`, `js/`, `css/`, `fonts/`) into `public/engine/`. Edge Workers never perform Git operations or asset ingestion.
- **Performance & Cold-Start Budgets:** Asset authorization must add no more than 300ms overhead to initial bundle load; title interactive within 5 seconds on a 25Mbps connection.

## Technical Decisions

- **Architecture Spine AD-2 (Engine Sandbox):** Isolates RPG Maker MZ global window variables (`$dataActors`, `$gamePlayer`, PixiJS) from the React DOM and Next.js lifecycle.
- **Iframe Sandboxing & Permissions:** Same-origin iframe requires `allow="fullscreen; autoplay"` and `sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-modals allow-pointer-lock allow-orientation-lock"` to ensure engine script execution, audio autoplay, and IndexedDB access while preventing top-level navigation hijack.
- **Viewport CSS Architecture:**
  - Outer viewport: `w-full h-[100dvh] flex flex-col bg-[#090A0F] overflow-hidden select-none`.
  - Aspect ratio container: `aspect-[16/9] w-full max-w-full max-h-[100dvh] mx-auto relative flex items-center justify-center` or responsive fit calculation so the 16:9 canvas maximizes available space within `100dvw` and `100dvh`.
  - `touch-action: manipulation` to prevent 300ms double-tap delay and unwanted gesture zooming.
- **Fullscreen API Handling:** Cross-browser support (`requestFullscreen`, `webkitRequestFullscreen`, `exitFullscreen`, `webkitExitFullscreen`) targeting the game container element, listening to `fullscreenchange` / `webkitfullscreenchange` to synchronize toggle state.
- **Engine Shell Scaffold:** Minimal placeholder `/engine/index.html` and lightweight engine assets in `public/engine/` to verify iframe loading, canvas mounting, and coordinate mapping before upstream sync in Story 3.3.

## UX & Interaction Patterns

- **Game Viewport Route (`/play`):** Only authorized patrons (`session.role IN ('admin', 'comp', 'patron')` with active $5+ tier and age verification) access this route. Unauthorized visitors are redirected to the paywall.
- **Control Overlay / Header:** A minimal, non-intrusive top bar or floating action allows returning to the studio portal and toggling fullscreen, ensuring the HUD does not obscure in-game RPG Maker touch controls (virtual D-pad or menu buttons).
- **Minimum Touch Targets:** Minimum 44×44px bounding box for all interactive controls (Fullscreen toggle, Return to Studio Portal).
- **Design Tokens:** Background `#090A0F`, Card/Panel `#121522`, Emerald Primary `#22C55E`, Crimson Accent `#E11D48`, Patron Gold `#FBBF24`, Mono fonts for status indicators.

## Cross-Story Dependencies

- **Epic 2 Precedent:** `/play` route guard depends on D1 session authorization (`validateSessionAccess`) and age-gate cookie verification.
- **Story 3.1 enables Story 3.2 & Story 3.3:** The responsive container and `/engine/index.html` iframe host the engine that will consume `/api/game/*` assets from R2.
- **Story 3.1 & 3.2 precede Epic 4:** The same-origin iframe hosting `/engine/index.html` is the mounting target for the in-game postMessage web bridge (`Ropoductions_WebBridge.js`) and Save HUD dock.
