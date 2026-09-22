# Epic 7 Context: Cross-Browser Engine Delivery & Boot Reliability

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Every supported player gets the same engine boot: the shell is release-addressed and immutable-cached so a reload is one cheap document request, session validation no longer scales with the boot's request burst, one aborted request cannot cost a sprite or the cursor, and any genuine boot failure becomes a localized, actionable recovery surface carrying the browser's diagnostic detail instead of MZ's raw error screen. Owner-reported Firefox 156 reload defects triggered the epic; measurement exonerated the sandbox/CSP/allow configuration, so what remains is delivery and burst behaviour plus honest reporting of genuine WebGL refusal.

## Stories

- Story 7.1: Engine Boot Failure Classification & Localized Recovery Surface
- Story 7.2: Release-Addressed Immutable Engine Shell Delivery
- Story 7.3: Burst-Safe Session Validation for Engine and Asset Requests
- Story 7.4: Engine Asset-Load Retry in the Injected Bridge Plugin
- Story 7.5: Firefox, Reload-Storm and Asset-Burst Verification

## Requirements & Constraints

- **Evidence bounds (distilled):** Firefox 156 never refused WebGL under the production header set and the shipped shell boots under it — the WebGL screen is browser/GPU state, unreachable by iframe config. Asset failures are ours: one boot costs 65+ gated requests, each doing a D1 session read, and allocates 6 WebGL contexts (Chrome's budget is 16); R2 objects exist and are typed correctly.
- **Taxonomy is the classification contract:** `webgl_unavailable`, `browser_capability`, `boot_request_failed`, `asset_load_failed`, `renderer_init_failed` (uses `webgl_unavailable` copy). Every player-visible failure maps to exactly one class; raw MZ strings are diagnostic input only. A new class means six-locale copy plus a host-surface branch.
- **Browser matrix:** Chrome/Edge latest and Firefox latest+ESR (desktop+Android) supported, Firefox first-class for verification; Safari portal-supported, engine needs WebGL2-capable Safari 15+. Without WebGL: honest classified failure — no canvas fallback exists (shipped Pixi 5.3.12 has no `CanvasRenderer`).
- **Owner gates (both decided; implementation unblocked):** OD-1 (asset-path validation amortisation) approved 2026-09-21 for 7.3. OD-2 (shell cache addressing) approved 2026-09-22 for 7.2 **as amended by the owner's own architecture directive (OD-2b)**: the identifier is a content digest computed and baked by the publish pipeline, not a `?v=<commitSha>` resolved at runtime, a shell file whose identifier is missing is served `private, max-age=86400` rather than refused, the shell document is `private, no-cache`, and `build-metadata.json` is published nowhere. Both decisions force amending `AGENTS.md`, `save-and-runtime-contract.md` and `engine-browser-compat.md` in the same cutover. Record of the directive and the amended acceptance criteria: `brief.md` §OD-2b, `epics.md` Story 7.2 amendment (2026-09-22), `spec-7-2-release-addressed-immutable-engine-shell-delivery.md`.
- **Binding:** FR-10/FR-11/FR-17 hold in Firefox and Chromium alike under reload; NFR-1 (title interactive ≤5s on 25Mbps) and SM-C2 (auth adds ≤300ms to initial load) bound validation/retry design; CAP-12/AD-11: exactly one engine document per `/play` mount — retry, fullscreen and HUD never remount the iframe.
- **Out of scope:** OAuth, session issuance, tier gating, admin model, engine build content, off-origin hosting, CDN, canvas fallback.
- **Repository policy:** worktree branch from updated `develop`, PR to `develop` only, user merges; Conventional Commits, no emojis, no story references in code comments, no silent cutover; new test files registered in suite manifests; superseded source-text assertions deleted, not re-pinned.

## Technical Decisions

- **Shell delivery (7.2):** the publish pipeline owns game versioning; the runtime never resolves or reads a release. `scripts/sync-game-release.ts` computes a content digest of the staged shell and bakes it into every shell subresource reference (`?v=<releaseId>`), then replaces the previously published shell in R2. The runtime serves the shell document `private, no-cache` (so a client discovers the published shell), addressed shell files `private, immutable, max-age=31536000`, an unaddressed shell file `private, max-age=86400` (a missed reference degrades to a revalidation, it is not refused), and leaves media (`img/ audio/ effects/ movies/ data/`) at `private, max-age=86400` and never addressed — the additive sync reuses file names. Because the identifier is a content digest, identical bytes keep identical URLs (rollback-safe) and any change yields a new URL set.
- **Burst amortisation (7.3):** bounded-TTL memoisation of a successfully validated session over `/engine/*` and `/api/game/*` (default 60s): at most one D1 read per burst. Fail-closed: validation error / expired / revoked / unknown ⇒ `403`/`5xx`, never implicit authorisation; failing requests never create or extend an entry. Revocation/expiry effective no later than TTL after the next request (contract-tested). Anonymous costs zero reads. State is per-isolate, keyed by session-cookie hash only, no plaintext token, never shared across sessions. Caveat: `validateSessionAccess` is not read-only (revokes on deleted overrides, elevates via `upsertSession`); deferred work records its double invocation on `/play`.
- **Asset retry in the bridge plugin (7.4):** at most 2 retries, exponential backoff with jitter, same URL, network-level failures only (abort, reset, `5xx`). `401`/`403` are never retried at the asset layer — they escalate to host session revalidation and the paywall path. Retries create no documents, iframe loads, or probe contexts; MZ's `canUseWebGL()` probe context is released via `WEBGL_lose_context`, one renderer context per boot. The plugin stays byte-identical with its synced mirror and the pipeline identity assertion passes; the deferred stale-`public/engine` mirror rule reopens at this engine-plugin touch — resolve it here.
- **Reporting (7.1):** engine-side failures reach the host over the existing `ROPODUCTIONS_` postMessage channel with the same origin and `event.source` checks — no second channel, no relaxed origin. The parent runs a WebGL preflight before mounting the engine document. The diagnostics payload captures repository-invisible state: injected-script inventory (CDN rewrites, bot-challenge injection), effective probe result and disabled-feature prefs, user agent, renderer/vendor strings, failing URL plus status or network error.
- **Verification contract (7.5):** Firefox desktop project in `playwright.config.ts`, CI runs both browsers; specs assert boot-to-ready with no recovery surface, five consecutive reloads with no failures or shell revalidation burst, an asset-burst replay with every response `200`/`304` costing ≤1 validation read, and a `webgl.disabled=true` profile producing the classified panel with the raw status message in the active locale. A repository script boots the real shell from the private bucket with production headers in both browsers and prints the boot profile — the brief's evidence table, reproducible on demand.

## UX & Interaction Patterns

- Recovery panel replaces the engine error screen: localized class name, actionable remediation (WebGL: enable hardware acceleration, restart browser, retry), raw `webglcontextcreationerror` status and renderer/vendor strings as attached detail, copyable diagnostics; request/asset classes name the failing URL and its retry outcome. A permanently missing asset is reported by the host, never only by the shipped upstream image-guard alert.
- Retry affordance: at most one additional engine load per activation, no second document while one is loading; keyboard-reachable, screen-reader-announced, 44x44px, WCAG AA contrast. All new strings ship in EN, ES, JA, PL, RU, ZH with `labels` parity and a screen-reader path; voice dignified, never accusatory.
- Design spine for the new surface: compact-panel `rounded-xl` (never `rounded-lg`), dialog overlays `z-50`, visible focus rings, `transition-colors duration-150` only (`transition-all` banned), reduced-motion 0ms, Lucide-only icons. It renders within `/play` chrome without disturbing the UX-DR6 16:9 `100dvh`/`100dvw` container or the engine iframe.

## Cross-Story Dependencies

- **Sequencing:** 7.1 first (makes remaining triggers observable); 7.2 and 7.3 independent of each other and 7.1; 7.4 depends on 7.1's reporting surface, not 7.2/7.3; 7.5 closes the epic needing 7.1-7.4 merged.
- **7.2 + 7.3 jointly produce** the reload profile 7.5 asserts: ≤1 shell document request, no revalidation burst, ≤1 D1 read per boot.
- **7.1's surface is the sink** for 7.4's exhausted-retry reports and the target of 7.5's WebGL-disabled assertion.
- **Epic 6 carry-in:** the merged single-tree viewport (AD-11) must survive every 7.x mechanism — one load event per mount. Canonical contracts: `engine-browser-compat.md`, CAP-13/CAP-14.
